import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import ViewController from "./controller";
import Manager from "./manager";
import Logger from "./logger";
import { Store } from "./store";
import * as str from "./strings";
import {
  Channel,
  ChatArgs,
  EventType,
  EventSource,
  InitializeState,
  Providers
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
import { ExtensionUriHandler } from "./uriHandler";
import {
  openUrl,
  toTitleCase,
  setVsContext,
  hasVslsExtension,
  sanitiseTokenString
} from "./utils";
import { askForAuth } from "./onboarding";
import ConfigHelper from "./config";
import Reporter from "./telemetry";
import IssueReporter from "./issues";

let store: Store;
let manager: Manager;
let controller: ViewController;
let reporter: Reporter;

const SUPPORTED_PROVIDERS = ["slack", "discord"];

export function activate(context: vscode.ExtensionContext) {
  Logger.log("Activating vscode-chat");
  store = new Store(context);
  manager = new Manager(store);
  reporter = new Reporter(manager);

  controller = new ViewController(
    context,
    () => manager.loadChannelHistory(manager.store.lastChannelId),
    () => manager.updateReadMarker()
  );

  const setupFreshInstall = () => {
    manager.store.generateInstallationId();
    const { installationId } = manager.store;
    reporter.setUniqueId(installationId);
    const hasUser = manager.isAuthenticated();

    if (!hasUser) {
      reporter.record(EventType.extensionInstalled, undefined, undefined);
    }
  };

  const setup = async ({ canPromptForAuth, initialState }): Promise<any> => {
    if (!manager.store.installationId) {
      setupFreshInstall();
    }

    if (!manager.token) {
      await manager.initializeToken(initialState);

      if (!manager.token) {
        if (canPromptForAuth && !hasVslsExtension()) {
          askForAuth();
        }

        throw new Error(str.TOKEN_NOT_FOUND);
      }
    }

    await manager.initializeProvider();
    const { currentUserInfo } = manager.store;

    if (!!currentUserInfo && !currentUserInfo.currentTeamId) {
      // If no current team is available, we need to ask
      await askForWorkspace();
    }

    manager.updateUserPrefs(); // async update
    // TODO: for discord, user prefs can only be updated after channels are fetched
    await manager.getUsersPromise();
    const { users } = manager.store;
    manager.chatProvider.subscribePresence(users);
    return manager.getChannelsPromise();
  };

  const sendMessage = (
    text: string,
    parentTimestamp: string
  ): Promise<void> => {
    const { lastChannelId, currentUserInfo } = manager.store;
    reporter.record(EventType.messageSent, undefined, lastChannelId);
    manager.updateReadMarker();

    if (!!parentTimestamp) {
      return manager.chatProvider.sendThreadReply(
        text,
        currentUserInfo.id,
        lastChannelId,
        parentTimestamp
      );
    } else {
      return manager.chatProvider.sendMessage(
        text,
        currentUserInfo.id,
        lastChannelId
      );
    }
  };

  const askForChannel = async (): Promise<Channel> => {
    await setup({ canPromptForAuth: true, initialState: undefined });
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
      const { channel } = selectedChannelLabel;
      manager.store.updateLastChannelId(channel.id);
      return channel;
    }
  };

  const getChatChannelId = (args?: ChatArgs): Promise<string> => {
    const { lastChannelId } = manager.store;
    let channelIdPromise: Promise<string> = null;

    if (!channelIdPromise && !!lastChannelId) {
      channelIdPromise = Promise.resolve(lastChannelId);
    }

    if (!!args) {
      if (!!args.channel) {
        // We have a channel in args
        const { channel } = args;
        manager.store.updateLastChannelId(channel.id);
        channelIdPromise = Promise.resolve(channel.id);
      } else if (!!args.user) {
        // We have a user, but no corresponding channel
        // So we create one
        channelIdPromise = manager.createIMChannel(args.user).then(channel => {
          return manager.store.updateLastChannelId(channel.id).then(() => {
            return channel.id;
          });
        });
      }
    }

    return !!channelIdPromise
      ? channelIdPromise
      : askForChannel().then(channel => channel.id);
  };

  const openChatPanel = (args?: ChatArgs) => {
    if (!!manager.token) {
      controller.loadUi();
    }

    setup({ canPromptForAuth: true, initialState: undefined })
      .then(() => getChatChannelId(args))
      .then(() => {
        manager.viewsManager.updateWebview();
        const { lastChannelId } = manager.store;
        const hasArgs = !!args && !!args.source;
        reporter.record(
          EventType.viewOpened,
          hasArgs ? args.source : EventSource.command,
          lastChannelId
        );
        manager.loadChannelHistory(lastChannelId);
      })
      .catch(error => console.error(error));
  };

  const askForWorkspace = async () => {
    const { currentUserInfo } = manager.store;
    const { teams } = currentUserInfo;
    const labels = teams.map(t => t.name);

    const selected = await vscode.window.showQuickPick([...labels], {
      placeHolder: str.CHANGE_WORKSPACE_TITLE
    });

    if (!!selected) {
      const selectedTeam = teams.find(t => t.name === selected);
      return manager.updateCurrentWorkspace(selectedTeam);
    }
  };

  const changeWorkspace = async () => {
    // TODO: If we don't have current user, we should ask for auth
    if (manager.isAuthenticated()) {
      await askForWorkspace();
      manager.clearOldWorkspace();
      manager.updateAllUI();
      await setup({ canPromptForAuth: false, initialState: undefined });
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
    const liveshare = await vsls.getApiAsync();

    // liveshare.share() creates a new session if required
    const vslsUri = await liveshare.share({ suppressNotification: true });
    let channelId: string = await getChatChannelId(args);
    reporter.record(EventType.vslsShared, EventSource.activity, channelId);

    const { currentUserInfo } = manager.store;
    manager.chatProvider.sendMessage(
      vslsUri.toString(),
      currentUserInfo.id,
      channelId
    );
  };

  const promptVslsJoin = (senderId: string, messageUri: vscode.Uri) => {
    if (senderId === manager.store.currentUserInfo.id) {
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
    return openUrl(urls[service]);
  };

  const reset = async (initialState?: InitializeState) => {
    const managerState = manager.getInitialState();

    if (managerState.provider === initialState.provider) {
      // Assume we are adding a new workspace
      manager.clearOldWorkspace();
      const { currentTeamId } = initialState;
      await manager.addWorkspaceById(currentTeamId);
    } else {
      manager.clearAll();
    }

    manager.updateAllUI();
    await setup({ canPromptForAuth: false, initialState });
  };

  const signout = async () => {
    await manager.signout();
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
    const isEnabled = hasVslsExtension();
    setVsContext("chat:vslsEnabled", isEnabled);
  };

  const askForProvider = async () => {
    const values = SUPPORTED_PROVIDERS.map(name => toTitleCase(name));
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
        const sanitisedToken = sanitiseTokenString(inputToken);

        try {
          await manager.validateToken(provider, sanitisedToken);
        } catch (error) {
          const actionItems = [str.REPORT_ISSUE];
          const messageResult = await vscode.window.showErrorMessage(
            str.INVALID_TOKEN(toTitleCase(provider)),
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
    const liveshare = await vsls.getApiAsync();
    const hasSession = !!liveshare && !!liveshare.session.id;

    if (!hasSession) {
      vscode.window.showInformationMessage(str.LIVE_SHARE_CHAT_NO_SESSION);
      return;
    }

    // Resume on existing VS Live Share chat if possible
    const { provider: currentProvider } = manager.getInitialState();
    const hasOtherProvider =
      currentProvider !== "vsls" || manager.chatProvider.isConnected();

    if (hasOtherProvider) {
      // Logged in with Slack/Discord, ask for confirmation to sign out
      const msg = str.LIVE_SHARE_CONFIRM_SIGN_OUT(toTitleCase(currentProvider));
      const response = await vscode.window.showInformationMessage(
        msg,
        str.SIGN_OUT
      );

      if (!!response && response === str.SIGN_OUT) {
        await reset({ provider: "vsls", currentTeamId: undefined });
      } else {
        return;
      }
    }

    await openChatPanel();
  };

  // Setup real-time messenger and updated local state
  setup({ canPromptForAuth: true, initialState: undefined });

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
    vscode.commands.registerCommand(SelfCommands.RESET_STORE, initialState =>
      reset(initialState)
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
      ({ isActive, currentUser }) => {
        const { provider } = manager.getInitialState();

        if (provider === Providers.vsls) {
          manager.updateCurrentUser(currentUser);
          manager.viewsManager.updateVslsStatus(isActive);
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
      SelfCommands.UPDATE_USER_PRESENCE,
      ({ userId, isOnline }) => {
        manager.updateUserPresence(userId, isOnline);
      }
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
          vscode.commands.executeCommand(SelfCommands.LIVE_SHARE_JOIN_PROMPT, {
            senderId,
            messageUri: uri
          });
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
