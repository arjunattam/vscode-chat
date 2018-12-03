import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import ViewController from "./controller";
import Manager from "./manager";
import Logger from "./logger";
import { Store } from "./store";
import * as str from "./strings";
import {
  SelfCommands,
  SLACK_OAUTH,
  DISCORD_OAUTH,
  LIVE_SHARE_BASE_URL,
  CONFIG_ROOT,
  TRAVIS_SCHEME
} from "./constants";
import travis from "./bots/travis";
import { ExtensionUriHandler } from "./uri";
import * as utils from "./utils";
import { askForAuth } from "./onboarding";
import { ConfigHelper } from "./config";
import TelemetryReporter from "./telemetry";
import IssueReporter from "./issues";

let store: Store;
let manager: Manager;
let controller: ViewController;
let telemetry: TelemetryReporter;

const SUPPORTED_PROVIDERS = ["slack", "discord"];

export function activate(context: vscode.ExtensionContext) {
  Logger.log("Activating vscode-chat");
  store = new Store(context);
  manager = new Manager(store);
  telemetry = new TelemetryReporter(manager);

  controller = new ViewController(
    context,
    provider => {
      if (provider) {
        const lastChannelId = manager.store.getLastChannelId(provider);

        if (lastChannelId) {
          return manager.loadChannelHistory(provider, lastChannelId);
        }
      }
    },
    provider => (!!provider ? manager.updateReadMarker(provider) : undefined)
  );

  const setupFreshInstall = () => {
    const installationId = manager.store.generateInstallationId();
    telemetry.setUniqueId(installationId);
    telemetry.record(
      EventType.extensionInstalled,
      undefined,
      undefined,
      undefined
    );
  };

  const handleNoToken = (canPromptForAuth: boolean) => {
    if (canPromptForAuth && !utils.hasVslsExtension()) {
      askForAuth();
    }

    throw new Error(str.TOKEN_NOT_FOUND);
  };

  const setup = async (
    canPromptForAuth: boolean,
    newProvider: string | undefined
  ): Promise<any> => {
    if (!manager.store.installationId) {
      setupFreshInstall();
    }

    if (!manager.isTokenInitialized) {
      await manager.initializeToken(newProvider);

      if (!manager.isTokenInitialized) {
        handleNoToken(canPromptForAuth);
      }
    }

    await manager.initializeProviders();

    // TODO: checking for current user for only current provider is incorrect
    const currentProvider = manager.getCurrentProvider();
    const currentUserInfo = manager.store.getCurrentUser(currentProvider);

    if (!!currentUserInfo && !currentUserInfo.currentTeamId) {
      // If no current team is available, we need to ask
      await askForWorkspace();
    }

    // TODO: In discord, user preferences are available after channels are fetched
    manager.updateUserPrefsForAll(); // async update
    await manager.initializeUsersStateForAll();
    manager.subscribePresenceForAll();
    await manager.initializeChannelsStateForAll();
    return manager.initializeVslsContactProvider();
  };

  const sendMessage = (
    providerName: string,
    text: string,
    parentTimestamp: string | undefined
  ) => {
    const lastChannelId = manager.store.getLastChannelId(providerName);
    telemetry.record(
      EventType.messageSent,
      undefined,
      lastChannelId,
      providerName
    );
    manager.updateReadMarker(providerName);

    if (!!lastChannelId) {
      // lastChannelId should always exist since this will only be
      // called after loading the webview (which requires lastChannelId)
      return manager.sendMessage(
        providerName,
        text,
        lastChannelId,
        parentTimestamp
      );
    }
  };

  const askForChannel = async (
    providerName: string
  ): Promise<Channel | undefined> => {
    await setup(true, undefined);
    let channelList = manager
      .getChannelLabels(providerName)
      .sort((a, b) => b.unread - a.unread);

    const qpickItems: vscode.QuickPickItem[] = channelList.map(
      channelLabel => ({
        label: channelLabel.label,
        description: channelLabel.channel.categoryName
      })
    );
    const selected = await vscode.window.showQuickPick(
      [...qpickItems, { label: str.RELOAD_CHANNELS }],
      { placeHolder: str.CHANGE_CHANNEL_TITLE }
    );

    if (!!selected) {
      if (selected.label === str.RELOAD_CHANNELS) {
        await manager.fetchUsers(providerName);
        await manager.fetchChannels(providerName);
        return askForChannel(providerName);
      }

      const selectedChannelLabel = channelList.find(
        x =>
          x.label === selected.label &&
          x.channel.categoryName === selected.description
      );

      if (!!selectedChannelLabel) {
        const { channel } = selectedChannelLabel;
        manager.store.updateLastChannelId(providerName, channel.id);
        return channel;
      }
    }
  };

  const getChatChannelId = async (
    providerName: string,
    args?: ChatArgs
  ): Promise<string | undefined> => {
    const lastChannelId = manager.store.getLastChannelId(providerName);
    let chatChannelId: string | undefined;

    if (!!lastChannelId) {
      chatChannelId = lastChannelId;
    }

    if (!!args) {
      if (!!args.channel) {
        // We have a channel in args
        const { channel } = args;
        manager.store.updateLastChannelId(providerName, channel.id);
        chatChannelId = channel.id;
      } else if (!!args.user) {
        // We have a user, but no corresponding channel
        // So we create one -->
        const channel = await manager.createIMChannel(providerName, args.user);

        if (!!channel) {
          manager.store.updateLastChannelId(providerName, channel.id);
          chatChannelId = channel.id;
        }
      }
    }

    if (!chatChannelId) {
      // Since we don't know the channel, we will prompt the user
      const channel = await askForChannel(providerName);

      if (!!channel) {
        chatChannelId = channel.id;
      }
    }

    return chatChannelId;
  };

  const openChatWebview = async (args?: ChatArgs) => {
    if (manager.isTokenInitialized) {
      controller.loadUi();
    }

    // TODO: incorrect to get current provider like this
    const provider = manager.getCurrentProvider();
    await setup(true, undefined);
    await getChatChannelId(provider, args);

    if (!!manager.viewsManager) {
      manager.viewsManager.updateWebview(provider);
    }

    const lastChannelId = manager.store.getLastChannelId(provider);

    if (!!lastChannelId) {
      const source = !!args ? args.source : EventSource.command;
      telemetry.record(EventType.viewOpened, source, lastChannelId, provider);
      manager.loadChannelHistory(provider, lastChannelId);
    }
  };

  const askForWorkspace = async () => {
    const provider = manager.getCurrentProvider();
    const currentUserInfo = manager.store.getCurrentUser(provider);

    if (!!currentUserInfo) {
      const { teams } = currentUserInfo;
      const labels = teams.map(team => team.name);

      const selected = await vscode.window.showQuickPick([...labels], {
        placeHolder: str.CHANGE_WORKSPACE_TITLE
      });

      if (!!selected) {
        const selectedTeam = teams.find(team => team.name === selected);

        if (!!selectedTeam) {
          return manager.updateCurrentWorkspace(selectedTeam, currentUserInfo);
        }
      }
    }
  };

  const changeWorkspace = async () => {
    // TODO: If we don't have current user, we should ask for auth
    await askForWorkspace();
    manager.clearOldWorkspace();
    manager.updateAllUI();
    await setup(false, undefined);
  };

  const changeChannel = async (args?: any) => {
    // TODO: when triggered from the search icon in the tree view,
    // this should be filtered to the `type` of the tree view section
    const hasArgs = !!args && !!args.source;
    const provider = manager.getCurrentProvider();
    telemetry.record(
      EventType.channelChanged,
      hasArgs ? args.source : EventSource.command,
      undefined,
      provider
    );

    const selectedChannel = await askForChannel(provider);
    return !!selectedChannel ? openChatWebview(args) : null;
  };

  const shareVslsLink = async (providerName: string, args?: ChatArgs) => {
    const liveshare = await vsls.getApi();

    if (!!liveshare) {
      // liveshare.share() creates a new session if required
      const vslsUri = await liveshare.share({ suppressNotification: true });
      let channelId = await getChatChannelId(providerName, args);
      telemetry.record(
        EventType.vslsShared,
        EventSource.activity,
        channelId,
        providerName
      );

      if (vslsUri && channelId) {
        manager.sendMessage(
          providerName,
          vslsUri.toString(),
          channelId,
          undefined
        );
      }
    }
  };

  const authenticate = (args?: any) => {
    const hasArgs = !!args && !!args.source;
    const provider = "slack"; // Only Slack OAuth is supported
    const urls = {
      slack: SLACK_OAUTH,
      discord: DISCORD_OAUTH
    };
    telemetry.record(
      EventType.authStarted,
      hasArgs ? args.source : EventSource.command,
      undefined,
      provider
    );
    return utils.openUrl(urls[provider]);
  };

  const reset = async (newProvider?: string) => {
    manager.clearAll();
    manager.updateAllUI();
    await setup(false, newProvider);
  };

  const signout = async () => {
    await manager.signout();
  };

  const updateSelfPresence = async (
    provider: string,
    presence: UserPresence
  ) => {
    const isSlack = provider === "slack";
    let durationInMinutes = 0;

    if (presence === UserPresence.doNotDisturb && isSlack) {
      // Ask for duration for dnd.snooze for slack implementation
      const options: { [label: string]: number } = {
        "20 minutes": 20,
        "1 hour": 60,
        "2 hours": 120,
        "4 hours": 240,
        "8 hours": 480,
        "24 hours": 1440
      };
      const selected = await vscode.window.showQuickPick(Object.keys(options), {
        placeHolder: str.SELECT_DND_DURATION
      });
      durationInMinutes = !!selected ? options[selected] : 0;
    }

    manager.updateSelfPresence(provider, presence, durationInMinutes);
  };

  const askForSelfPresence = async () => {
    // Called when user triggers a change for self presence
    // using manual command.
    const currentProvider = manager.getCurrentProvider();
    // TODO: presence change is only possible for slack or discord (not vsls)
    const isSlack = currentProvider === "slack";
    const currentPresence = manager.getCurrentUserPresence(currentProvider);
    const presenceChoices = [
      UserPresence.available,
      UserPresence.doNotDisturb,
      UserPresence.invisible
    ];

    if (!isSlack) {
      // Slack does not have the idle option
      presenceChoices.push(UserPresence.idle);
    }

    const items: vscode.QuickPickItem[] = presenceChoices.map(choice => {
      const isCurrent = currentPresence === choice;
      return {
        label: utils.camelCaseToTitle(choice),
        description: isCurrent ? "current" : ""
      };
    });
    const status = await vscode.window.showQuickPick(items, {
      placeHolder: str.SELECT_SELF_PRESENCE
    });

    if (!!status) {
      const presence = utils.titleCaseToCamel(status.label) as UserPresence;
      updateSelfPresence(currentProvider, presence);
    }
  };

  const fetchReplies = (provider: string, parentTimestamp: string) => {
    manager.fetchThreadReplies(provider, parentTimestamp);
  };

  const resetConfiguration = (event: vscode.ConfigurationChangeEvent) => {
    const affectsExtension = event.affectsConfiguration(CONFIG_ROOT);

    if (affectsExtension) {
      reset();
    }
  };

  const setVslsContext = () => {
    const isEnabled = utils.hasVslsExtension();
    utils.setVsContext("chat:vslsEnabled", isEnabled);
  };

  const askForProvider = async () => {
    const values = SUPPORTED_PROVIDERS.map(name => utils.toTitleCase(name));
    const selection = await vscode.window.showQuickPick(values, {
      placeHolder: str.CHANGE_PROVIDER_TITLE
    });
    return !!selection ? selection.toLowerCase() : undefined;
  };

  const configureToken = async () => {
    const provider = await askForProvider();
    telemetry.record(
      EventType.tokenConfigured,
      EventSource.command,
      undefined,
      provider
    );

    if (!!provider) {
      const inputToken = await vscode.window.showInputBox({
        placeHolder: str.TOKEN_PLACEHOLDER,
        password: true
      });

      if (!!inputToken) {
        const sanitisedToken = utils.sanitiseTokenString(inputToken);

        try {
          await manager.validateToken(provider, sanitisedToken);
        } catch (error) {
          const actionItems = [str.REPORT_ISSUE];
          const messageResult = await vscode.window.showErrorMessage(
            str.INVALID_TOKEN(utils.toTitleCase(provider)),
            ...actionItems
          );

          if (!!messageResult && messageResult === str.REPORT_ISSUE) {
            const issue = `[${provider}] Invalid token`;
            IssueReporter.openNewIssue(issue, "");
          }

          return;
        }

        return ConfigHelper.setToken(sanitisedToken, provider);
      }
    }
  };

  const chatWithVslsContact = async (item: any) => {
    const contactProvider = manager.vslsContactProvider;

    const contact = item.contactModel.contact;
    let user: User | undefined;

    if (!!contactProvider) {
      const presenceProvider = contactProvider.presenceProviderName;
      const matchedId = contactProvider.getMatchedUserId(contact.id);

      if (!!matchedId) {
        user = manager.getUserForId(presenceProvider, matchedId);
      } else {
        // contact.id can also be a user id
        user = manager.getUserForId(presenceProvider, contact.id);
      }

      if (!!user) {
        let imChannel = manager.getIMChannel(presenceProvider, user);

        if (!imChannel) {
          imChannel = await manager.createIMChannel(presenceProvider, user);
        }

        if (!!imChannel) {
          manager.store.updateLastChannelId(presenceProvider, imChannel.id);
          openChatWebview();
        }
      } else {
        vscode.window.showInformationMessage(str.UNABLE_TO_MATCH_CONTACT);
      }
    }
  };

  // Setup real-time messenger and updated local state
  setup(true, undefined);

  // Setup context for conditional views
  setVslsContext();

  const uriHandler = new ExtensionUriHandler();
  context.subscriptions.push(
    vscode.commands.registerCommand(SelfCommands.OPEN_WEBVIEW, openChatWebview),
    vscode.commands.registerCommand(
      SelfCommands.CHANGE_WORKSPACE,
      changeWorkspace
    ),
    vscode.commands.registerCommand(SelfCommands.CHANGE_CHANNEL, changeChannel),
    vscode.commands.registerCommand(SelfCommands.SIGN_IN, authenticate),
    vscode.commands.registerCommand(SelfCommands.SIGN_OUT, signout),
    vscode.commands.registerCommand(
      SelfCommands.RESET_STORE,
      ({ newProvider }) => reset(newProvider)
    ),
    vscode.commands.registerCommand(
      SelfCommands.CONFIGURE_TOKEN,
      configureToken
    ),
    vscode.commands.registerCommand(
      SelfCommands.SEND_MESSAGE,
      ({ text, provider }) => sendMessage(provider, text, undefined)
    ),
    vscode.commands.registerCommand(
      SelfCommands.SEND_THREAD_REPLY,
      ({ text, parentTimestamp, provider }) =>
        sendMessage(provider, text, parentTimestamp)
    ),
    vscode.commands.registerCommand(
      SelfCommands.LIVE_SHARE_FROM_MENU,
      (item: ChatTreeNode) => {
        return shareVslsLink(item.providerName, {
          channel: item.channel,
          user: item.user,
          source: EventSource.activity
        });
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.LIVE_SHARE_SLASH,
      ({ provider }) => {
        const channelId = manager.store.getLastChannelId(provider);
        shareVslsLink(provider, {
          channel: manager.getChannel(provider, channelId),
          user: undefined,
          source: EventSource.slash
        });
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.LIVE_SHARE_SESSION_CHANGED,
      ({ isSessionActive, currentUser }) => {
        const enabledProviders = manager.getEnabledProviders();

        if (enabledProviders.indexOf("vsls") >= 0) {
          manager.store.updateCurrentUser("vsls", currentUser);

          if (!!manager.viewsManager) {
            manager.viewsManager.updateVslsStatus(isSessionActive);
          }
        }
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.FETCH_REPLIES,
      ({ parentTimestamp, provider }) => fetchReplies(provider, parentTimestamp)
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_MESSAGES,
      ({ channelId, messages, provider }) => {
        manager.updateMessages(provider, channelId, messages);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.ADD_MESSAGE_REACTION,
      ({ userId, msgTimestamp, channelId, reactionName, provider }) => {
        manager.addReaction(
          provider,
          channelId,
          msgTimestamp,
          userId,
          reactionName
        );
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.REMOVE_MESSAGE_REACTION,
      ({ userId, msgTimestamp, channelId, reactionName, provider }) => {
        manager.removeReaction(
          provider,
          channelId,
          msgTimestamp,
          userId,
          reactionName
        );
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_PRESENCE_STATUSES,
      ({ userId, presence, provider }) => {
        manager.updatePresenceForUser(provider, userId, presence);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_SELF_PRESENCE,
      askForSelfPresence
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_SELF_PRESENCE_VIA_VSLS,
      ({ presence, provider }) => updateSelfPresence(provider, presence)
    ),
    vscode.commands.registerCommand(SelfCommands.CHAT_WITH_VSLS_CONTACT, item =>
      chatWithVslsContact(item)
    ),
    vscode.commands.registerCommand(
      SelfCommands.CHANNEL_MARKED,
      ({ channelId, readTimestamp, unreadCount, provider }) => {
        return manager.updateChannelMarked(
          provider,
          channelId,
          readTimestamp,
          unreadCount
        );
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_MESSAGE_REPLIES,
      ({ provider, channelId, parentTimestamp, reply }) => {
        manager.updateMessageReply(provider, parentTimestamp, channelId, reply);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.HANDLE_INCOMING_LINKS,
      ({ uri, senderId }) => {
        if (uri.authority === LIVE_SHARE_BASE_URL) {
          if (!!manager.vslsContactProvider) {
            manager.vslsContactProvider.notifyInviteReceived(senderId, uri);
          }
        }
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.SEND_TO_WEBVIEW,
      ({ uiMessage }) => controller.sendToUI(uiMessage)
    ),
    vscode.workspace.onDidChangeConfiguration(resetConfiguration),
    vscode.workspace.registerTextDocumentContentProvider(TRAVIS_SCHEME, travis),
    vscode.window.registerUriHandler(uriHandler),
    manager,
    telemetry
  );
}

export function deactivate() {}
