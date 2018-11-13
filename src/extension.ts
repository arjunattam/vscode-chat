import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import ViewController from "./controller";
import Manager from "./manager";
import Logger from "./logger";
import { Store } from "./store";
import * as str from "./strings";
import {
  User,
  Channel,
  ChatArgs,
  EventType,
  EventSource,
  UserPresence
} from "./types";
import {
  SelfCommands,
  LiveShareCommands,
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
import ConfigHelper from "./config";
import TelemetryReporter from "./telemetry";
import IssueReporter from "./issues";

let store: Store;
let manager: Manager;
let controller: ViewController;
let reporter: TelemetryReporter;

const SUPPORTED_PROVIDERS = ["slack", "discord"];

export function activate(context: vscode.ExtensionContext) {
  Logger.log("Activating vscode-chat");
  store = new Store(context);
  manager = new Manager(store);
  reporter = new TelemetryReporter(manager);

  controller = new ViewController(
    context,
    () => {
      const { lastChannelId } = manager.store;
      if (lastChannelId) {
        return manager.loadChannelHistory(lastChannelId);
      }
    },
    () => manager.updateReadMarker()
  );

  const setupFreshInstall = () => {
    const installationId = manager.store.generateInstallationId();
    reporter.setUniqueId(installationId);
    reporter.record(EventType.extensionInstalled, undefined, undefined);
  };

  const handleNoToken = (canPromptForAuth: boolean) => {
    if (canPromptForAuth && !utils.hasVslsExtension()) {
      askForAuth();
    }

    throw new Error(str.TOKEN_NOT_FOUND);
  };

  const setup = async (
    canPromptForAuth: boolean,
    provider: string | undefined
  ): Promise<any> => {
    if (!manager.store.installationId) {
      setupFreshInstall();
    }

    if (!manager.token) {
      await manager.initializeToken(provider);

      if (!manager.token) {
        handleNoToken(canPromptForAuth);
      }
    }

    await manager.initializeProvider();
    const { currentUserInfo } = manager.store;

    if (!!currentUserInfo && !currentUserInfo.currentTeamId) {
      // If no current team is available, we need to ask
      await askForWorkspace();
    }

    // TODO: In discord, user preferences are available after channels are fetched
    manager.updateUserPrefs(); // async update
    await manager.initializeUsersState();
    const { users } = manager.store;

    if (!!manager.chatProvider) {
      manager.chatProvider.subscribePresence(users);
    }

    await manager.initializeChannelsState();
    return manager.initializeVslsContactProvider();
  };

  const sendMessage = (text: string, parentTimestamp: string | undefined) => {
    const { lastChannelId } = manager.store;
    reporter.record(EventType.messageSent, undefined, lastChannelId);
    manager.updateReadMarker();

    if (!!lastChannelId) {
      // lastChannelId should always exist since this will only be
      // called after loading the webview (which requires lastChannelId)
      return manager.sendMessage(text, lastChannelId, parentTimestamp);
    }
  };

  const askForChannel = async (): Promise<Channel | undefined> => {
    await setup(true, undefined);
    let channelList = manager
      .getChannelLabels()
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
        await manager.fetchUsers();
        await manager.fetchChannels();
        return askForChannel();
      }

      const selectedChannelLabel = channelList.find(
        x =>
          x.label === selected.label &&
          x.channel.categoryName === selected.description
      );

      if (!!selectedChannelLabel) {
        const { channel } = selectedChannelLabel;
        manager.store.updateLastChannelId(channel.id);
        return channel;
      }
    }
  };

  const getChatChannelId = async (
    args?: ChatArgs
  ): Promise<string | undefined> => {
    const { lastChannelId } = manager.store;
    let chatChannelId: string | undefined;

    if (!!lastChannelId) {
      chatChannelId = lastChannelId;
    }

    if (!!args) {
      if (!!args.channel) {
        // We have a channel in args
        const { channel } = args;
        manager.store.updateLastChannelId(channel.id);
        chatChannelId = channel.id;
      } else if (!!args.user) {
        // We have a user, but no corresponding channel
        // So we create one -->
        const channel = await manager.createIMChannel(args.user);

        if (!!channel) {
          manager.store.updateLastChannelId(channel.id);
          chatChannelId = channel.id;
        }
      }
    }

    if (!chatChannelId) {
      // Since we don't know the channel, we will prompt the user
      const channel = await askForChannel();

      if (!!channel) {
        chatChannelId = channel.id;
      }
    }

    return chatChannelId;
  };

  const openChatPanel = async (args?: ChatArgs) => {
    if (!!manager.token) {
      controller.loadUi();
    }

    await setup(true, undefined);
    await getChatChannelId(args);

    if (!!manager.viewsManager) {
      manager.viewsManager.updateWebview();
    }

    const { lastChannelId } = manager.store;

    if (!!lastChannelId) {
      const source = !!args ? args.source : EventSource.command;
      reporter.record(EventType.viewOpened, source, lastChannelId);
      manager.loadChannelHistory(lastChannelId);
    }
  };

  const askForWorkspace = async () => {
    const { currentUserInfo } = manager.store;

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
    if (manager.isAuthenticated()) {
      await askForWorkspace();
      manager.clearOldWorkspace();
      manager.updateAllUI();
      await setup(false, undefined);
    }
  };

  const changeChannel = async (args?: any) => {
    // TODO: when triggered from the search icon in the tree view,
    // this should be filtered to the `type` of the tree view section
    const hasArgs = !!args && !!args.source;
    reporter.record(
      EventType.channelChanged,
      hasArgs ? args.source : EventSource.command,
      undefined
    );

    const selectedChannel = await askForChannel();
    return !!selectedChannel ? openChatPanel(args) : null;
  };

  const shareVslsLink = async (args?: ChatArgs) => {
    const liveshare = await vsls.getApi();

    if (!!liveshare) {
      // liveshare.share() creates a new session if required
      const vslsUri = await liveshare.share({ suppressNotification: true });
      let channelId = await getChatChannelId(args);
      reporter.record(EventType.vslsShared, EventSource.activity, channelId);

      if (vslsUri && channelId) {
        manager.sendMessage(vslsUri.toString(), channelId, undefined);
      }
    }
  };

  const promptVslsJoin = (senderId: string, messageUri: vscode.Uri) => {
    const { currentUserInfo } = manager.store;

    if (!!currentUserInfo && senderId === currentUserInfo.id) {
      // This is our own message, ignore it
      return;
    }

    const user = manager.store.users[senderId];

    if (!!user) {
      // We should prompt for auto-joining here
      const infoMessage = str.LIVE_SHARE_INVITE(user.name);
      const actionItems = ["Join", "Ignore"];
      vscode.window
        .showInformationMessage(infoMessage, ...actionItems)
        .then(selected => {
          if (selected === "Join") {
            const opts = { newWindow: false };
            vscode.commands.executeCommand(
              LiveShareCommands.JOIN,
              messageUri.toString(),
              opts
            );
          }
        });
    }
  };

  const authenticate = (args?: any) => {
    const hasArgs = !!args && !!args.source;
    const service = "slack"; // Only Slack OAuth is supported
    const urls = {
      slack: SLACK_OAUTH,
      discord: DISCORD_OAUTH
    };
    reporter.record(
      EventType.authStarted,
      hasArgs ? args.source : EventSource.command,
      undefined
    );
    return utils.openUrl(urls[service]);
  };

  const reset = async (newProvider?: string) => {
    manager.clearAll();
    manager.updateAllUI();
    await setup(false, newProvider);
  };

  const signout = async () => {
    const provider = manager.getSelectedProvider();

    if (!!provider) {
      await ConfigHelper.clearToken(provider);
    }
  };

  const updateSelfPresence = async (presence: UserPresence) => {
    const isSlack = manager.getSelectedProvider() === "slack";
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
      const selected = await vscode.window.showQuickPick(Object.keys(options));
      durationInMinutes = !!selected ? options[selected] : 0;
    }

    manager.updateSelfPresence(presence, durationInMinutes);
  };

  const askForSelfPresence = async () => {
    // Called when user triggers a change for self presence
    // using manual command.
    const isSlack = manager.getSelectedProvider() === "slack";
    const currentPresence = manager.getCurrentPresence();
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
        label: choice,
        description: isCurrent ? "current" : ""
      };
    });
    const status = await vscode.window.showQuickPick(items);

    if (!!status) {
      updateSelfPresence(status.label as UserPresence);
    }
  };

  const fetchReplies = (parentTimestamp: string) => {
    manager.fetchThreadReplies(parentTimestamp);
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
    reporter.record(EventType.tokenConfigured, EventSource.command, undefined);
    const provider = await askForProvider();

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

  const runDiagnostic = async () => {
    let results = [];
    results.push(`Installation id: ${!!manager.store.installationId}`);
    results.push(`Token configured: ${!!manager.token}`);
    results.push(`Current user available: ${!!manager.store.currentUserInfo}`);

    if (!!manager.chatProvider) {
      results.push(
        `Websocket connected: ${manager.chatProvider.isConnected()}`
      );
    }

    const logs = results.join("\n");
    const body = `### Issue description\n\n### Logs\n ${logs}`;
    const title = `Diagnostic logs`;
    return IssueReporter.openNewIssue(title, body);
  };

  const startVslsChat = async () => {
    // Verify that we have an ongoing Live Share session
    const liveshare = await vsls.getApi();
    const hasSession = !!liveshare && !!liveshare.session.id;

    if (!hasSession) {
      vscode.window.showInformationMessage(str.LIVE_SHARE_CHAT_NO_SESSION);
      return;
    }

    // Resume on existing VS Live Share chat if possible
    const currentProvider = manager.getSelectedProvider();
    const hasOtherProvider = currentProvider !== "vsls";
    const isOtherConnected = !!manager.chatProvider
      ? manager.chatProvider.isConnected()
      : false;

    if (hasOtherProvider || isOtherConnected) {
      // Logged in with Slack/Discord, ask for confirmation to sign out
      const msg = str.LIVE_SHARE_CONFIRM_SIGN_OUT(
        utils.toTitleCase(currentProvider as string)
      );
      const response = await vscode.window.showInformationMessage(
        msg,
        str.SIGN_OUT
      );

      if (!!response && response === str.SIGN_OUT) {
        await reset("vsls");
      } else {
        return;
      }
    }

    await openChatPanel();
  };

  const chatWithVslsContact = async (item: any) => {
    const provider = manager.vslsContactProvider;
    const contact = item.contactModel.contact;
    let user: User | undefined;

    if (!!provider) {
      const matchedId = provider.getMatchedUserId(contact.id);

      if (!!matchedId) {
        user = manager.getUserForId(matchedId);
      } else {
        // contact.id can also be a user id
        user = manager.getUserForId(contact.id);
      }
    }

    if (!!user) {
      const imChannel = manager.getIMChannel(user);

      if (!!imChannel) {
        // Open the webview
        // TODO: handle situation where we don't have im channel
        manager.store.updateLastChannelId(imChannel.id);
        openChatPanel();
      }
    }
  };

  // Setup real-time messenger and updated local state
  setup(true, undefined);

  // Setup context for conditional views
  setVslsContext();

  const uriHandler = new ExtensionUriHandler();
  context.subscriptions.push(
    vscode.commands.registerCommand(SelfCommands.OPEN_WEBVIEW, openChatPanel),
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
    vscode.commands.registerCommand(SelfCommands.DIAGNOSTIC, runDiagnostic),
    vscode.commands.registerCommand(SelfCommands.SEND_MESSAGE, ({ text }) =>
      sendMessage(text, undefined)
    ),
    vscode.commands.registerCommand(
      SelfCommands.SEND_THREAD_REPLY,
      ({ text, parentTimestamp }) => sendMessage(text, parentTimestamp)
    ),
    vscode.commands.registerCommand(SelfCommands.LIVE_SHARE_FROM_MENU, item =>
      shareVslsLink({
        channel: item.channel,
        user: item.user,
        source: EventSource.activity
      })
    ),
    vscode.commands.registerCommand(SelfCommands.LIVE_SHARE_SLASH, () => {
      shareVslsLink({
        channel: manager.getChannel(manager.store.lastChannelId),
        user: undefined,
        source: EventSource.slash
      });
    }),
    vscode.commands.registerCommand(
      SelfCommands.LIVE_SHARE_JOIN_PROMPT,
      ({ senderId, messageUri }) => promptVslsJoin(senderId, messageUri)
    ),
    vscode.commands.registerCommand(
      SelfCommands.LIVE_SHARE_CHAT_START,
      startVslsChat
    ),
    vscode.commands.registerCommand(
      SelfCommands.LIVE_SHARE_SESSION_CHANGED,
      ({ isSessionActive, currentUser }) => {
        const provider = manager.getSelectedProvider();

        if (provider === "vsls") {
          manager.store.updateCurrentUser(currentUser);

          if (!!manager.viewsManager) {
            manager.viewsManager.updateVslsStatus(isSessionActive);
          }
        }
      }
    ),
    vscode.commands.registerCommand(SelfCommands.FETCH_REPLIES, fetchReplies),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_MESSAGES,
      ({ channelId, messages }) => {
        manager.updateMessages(channelId, messages);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.ADD_MESSAGE_REACTION,
      ({ userId, msgTimestamp, channelId, reactionName }) => {
        manager.addReaction(channelId, msgTimestamp, userId, reactionName);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.REMOVE_MESSAGE_REACTION,
      ({ userId, msgTimestamp, channelId, reactionName }) => {
        manager.removeReaction(channelId, msgTimestamp, userId, reactionName);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_PRESENCE_STATUSES,
      ({ userId, presence }) => {
        manager.updatePresenceForUser(userId, presence);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_SELF_PRESENCE,
      askForSelfPresence
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_SELF_PRESENCE_VIA_VSLS,
      ({ presence }) => updateSelfPresence(presence)
    ),
    vscode.commands.registerCommand(SelfCommands.CHAT_WITH_VSLS_CONTACT, item =>
      chatWithVslsContact(item)
    ),
    vscode.commands.registerCommand(
      SelfCommands.CHANNEL_MARKED,
      ({ channelId, readTimestamp, unreadCount }) => {
        const channel = manager.getChannel(channelId);

        if (!!channel) {
          manager.updateChannel({ ...channel, readTimestamp, unreadCount });
          manager.updateAllUI();
        }
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_MESSAGE_REPLIES,
      ({ channelId, parentTimestamp, reply }) => {
        manager.updateMessageReply(parentTimestamp, channelId, reply);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.HANDLE_INCOMING_LINKS,
      ({ uri, senderId }) => {
        if (uri.authority === LIVE_SHARE_BASE_URL) {
          // We are replacing our own prompt with the live share prompt.
          // TODO: Clear up the rest of the code for vsls join prompt.

          // vscode.commands.executeCommand(SelfCommands.LIVE_SHARE_JOIN_PROMPT, {
          //   senderId,
          //   messageUri: uri
          // });

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
    reporter
  );
}

export function deactivate() {}
