import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import ViewController from "./controller";
import Store from "./store";
import Logger from "./logger";
import * as str from "./strings";
import { Channel, ChatArgs, EventType, EventSource } from "./interfaces";
import {
  SelfCommands,
  LiveShareCommands,
  SLACK_OAUTH,
  DISCORD_OAUTH,
  LIVE_SHARE_BASE_URL,
  VSLS_EXTENSION_ID,
  CONFIG_ROOT,
  TRAVIS_SCHEME
} from "./constants";
import travis from "./providers/travis";
import { ExtensionUriHandler } from "./uri";
import { openUrl, getExtension } from "./utils";
import ConfigHelper from "./config";
import Reporter from "./telemetry";

let store: Store | undefined = undefined;
let controller: ViewController | undefined = undefined;
let reporter: Reporter | undefined = undefined;

const SUPPORTED_PROVIDERS = ["slack", "discord"];

export function activate(context: vscode.ExtensionContext) {
  Logger.log("Activating vscode-chat");
  store = new Store(context);
  reporter = new Reporter(store);

  controller = new ViewController(
    context,
    () => store.loadChannelHistory(store.lastChannelId),
    () => store.updateReadMarker()
  );
  store.setUiCallback(uiMessage => controller.sendToUI(uiMessage));

  const setupFreshInstall = () => {
    store.generateInstallationId();
    const { installationId } = store;
    reporter.setUniqueId(installationId);
    const hasUser = store.isAuthenticated();

    if (!hasUser) {
      reporter.record(EventType.extensionInstalled, undefined, undefined);
    }
  };

  const setup = async (canPromptForAuth?: boolean): Promise<any> => {
    // TODO: window reloading asks me for discord team id
    if (!store.installationId) {
      setupFreshInstall();
    }

    if (!store.token) {
      await store.initializeToken();

      if (!store.token) {
        if (canPromptForAuth) {
          ConfigHelper.askForAuth();
        }

        throw new Error(str.TOKEN_NOT_FOUND);
      }
    }

    return store
      .initializeProvider()
      .then(currentUser => store.updateCurrentUser(currentUser))
      .then(() => {
        // If no current team is available, we need to ask
        const { currentUserInfo } = store;
        if (!currentUserInfo.currentTeamId) {
          return askForWorkspace();
        }
      })
      .then(() => {
        store.updateUserPrefs();
        return store.getUsersPromise();
      })
      .then(() => {
        const { users } = store;
        store.chatProvider.subscribePresence(users);
        return store.getChannelsPromise();
      })
      .catch(error => Logger.log(error));
  };

  const sendMessage = (text: string): Promise<void> => {
    const { lastChannelId, currentUserInfo } = store;
    reporter.record(EventType.messageSent, undefined, lastChannelId);
    store.updateReadMarker();
    return store.chatProvider.sendMessage(
      text,
      currentUserInfo.id,
      lastChannelId
    );
  };

  const askForChannel = (): Promise<Channel> => {
    return setup(true).then(() => {
      let channelList = store
        .getChannelLabels()
        .sort((a, b) => b.unread - a.unread);

      const placeHolder = str.CHANGE_CHANNEL_TITLE;
      const labels = channelList.map(c => `${c.label}`);

      return vscode.window
        .showQuickPick([...labels, str.RELOAD_CHANNELS], { placeHolder })
        .then(selected => {
          if (selected) {
            if (selected === str.RELOAD_CHANNELS) {
              return store
                .fetchUsers()
                .then(() => store.fetchChannels())
                .then(() => askForChannel());
            }
            const selectedChannel = channelList.find(x => x.label === selected);
            const { channel } = selectedChannel;
            store.updateLastChannelId(channel.id);
            return channel;
          }
        });
    });
  };

  const getChatChannelId = (args?: ChatArgs): Promise<string> => {
    const { lastChannelId } = store;
    let channelIdPromise: Promise<string> = null;

    if (!channelIdPromise && !!lastChannelId) {
      channelIdPromise = Promise.resolve(lastChannelId);
    }

    if (!!args) {
      if (!!args.channel) {
        // We have a channel in args
        const { channel } = args;
        store.updateLastChannelId(channel.id);
        channelIdPromise = Promise.resolve(channel.id);
      } else if (!!args.user) {
        // We have a user, but no corresponding channel
        // So we create one
        channelIdPromise = store.createIMChannel(args.user).then(channel => {
          return store.updateLastChannelId(channel.id).then(() => {
            return channel.id;
          });
        });
      }
    }

    return !!channelIdPromise
      ? channelIdPromise
      : askForChannel().then(channel => channel.id);
  };

  const openSlackPanel = (args?: ChatArgs) => {
    if (!!store.token) {
      controller.loadUi();
    }

    setup(true)
      .then(() => getChatChannelId(args))
      .then(() => {
        store.updateWebviewUI();
        const { lastChannelId } = store;
        const hasArgs = !!args && !!args.source;
        reporter.record(
          EventType.viewOpened,
          hasArgs ? args.source : EventSource.command,
          lastChannelId
        );
        store.loadChannelHistory(lastChannelId);
      })
      .catch(error => console.error(error));
  };

  const askForWorkspace = () => {
    const { currentUserInfo } = store;
    const { teams } = currentUserInfo;
    const placeHolder = str.CHANGE_WORKSPACE_TITLE;
    const labels = teams.map(t => t.name);
    return vscode.window
      .showQuickPick([...labels], { placeHolder })
      .then(selected => {
        if (!!selected) {
          const selectedTeam = teams.find(t => t.name === selected);
          return store.updateCurrentWorkspace(selectedTeam);
        }
      });
  };

  const changeWorkspace = () => {
    const { currentUserInfo } = store;
    // TODO: If we don't have current user, we should
    // ask for authentication

    if (!!currentUserInfo) {
      return askForWorkspace().then(() => {
        store.clearWorkspace();
        store.updateAllUI();
        return setup();
      });
    }
  };

  const changeChannel = (args?: any) => {
    // TODO: when triggered from the search icon in the tree view,
    // this should be filtered to the `type` of the tree view section
    const hasArgs = !!args && !!args.source;
    reporter.record(
      EventType.channelChanged,
      hasArgs ? args.source : EventSource.command,
      undefined
    );

    return askForChannel().then(
      result => (!!result ? openSlackPanel(args) : null)
    );
  };

  const shareVslsLink = async (args?: ChatArgs) => {
    const liveshare = await vsls.getApiAsync();
    // liveshare.share() creates a new session if required
    const vslsUri = await liveshare.share({ suppressNotification: true });
    let channelId: string = await getChatChannelId(args);
    reporter.record(EventType.vslsShared, EventSource.activity, channelId);
    const { currentUserInfo } = store;
    store.chatProvider.sendMessage(
      vslsUri.toString(),
      currentUserInfo.id,
      channelId
    );
  };

  const promptVslsJoin = (senderId: string, messageUri: vscode.Uri) => {
    if (senderId === store.currentUserInfo.id) {
      // This is our own message, ignore it
      return;
    }

    const user = store.users[senderId];

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
    // TODO: ensure that we always send service here
    const service = args.service;
    const urls = {
      slack: SLACK_OAUTH,
      discord: DISCORD_OAUTH
    };
    // TODO: update telemetry with service name
    reporter.record(
      EventType.authStarted,
      hasArgs ? args.source : EventSource.command,
      undefined
    );
    return openUrl(urls[service]);
  };

  const reset = async () => {
    store.clearAll();
    store.updateAllUI();
    await setup();
    store.updateAllUI(); // TODO: can we remove this
  };

  const signout = async () => {
    // Signing out will clear token for the current provider
    await ConfigHelper.clearToken();
  };

  const fetchReplies = parentTimestamp => {
    store.fetchThreadReplies(parentTimestamp);
  };

  const resetConfiguration = (event: vscode.ConfigurationChangeEvent) => {
    const affectsExtension = event.affectsConfiguration(CONFIG_ROOT);

    if (affectsExtension) {
      reset();
    }
  };

  const setVslsContext = () => {
    const vsls = getExtension(VSLS_EXTENSION_ID);
    const isEnabled = !!vsls;
    vscode.commands.executeCommand("setContext", "chat:vslsEnabled", isEnabled);
  };

  const askForProvider = () => {
    return vscode.window
      .showQuickPick(
        SUPPORTED_PROVIDERS.map(
          // Convert to title case
          name => name.charAt(0).toUpperCase() + name.substr(1).toLowerCase()
        ),
        { placeHolder: str.CHANGE_PROVIDER_TITLE }
      )
      .then(selected => (!!selected ? selected.toLowerCase() : undefined));
  };

  const configureToken = () => {
    // TODO: save provider in telemetry event
    reporter.record(EventType.tokenConfigured, EventSource.command, undefined);

    return askForProvider().then(selectedProvider => {
      if (!!selectedProvider) {
        return vscode.window
          .showInputBox({
            placeHolder: str.TOKEN_PLACEHOLDER,
            password: true
          })
          .then(input => {
            if (!!input) {
              return ConfigHelper.setToken(input, selectedProvider);
            }
          });
      }
    });
  };

  // Setup real-time messenger and updated local state
  setup(true);

  // Setup context for conditional views
  setVslsContext();

  const uriHandler = new ExtensionUriHandler();
  context.subscriptions.push(
    vscode.commands.registerCommand(SelfCommands.OPEN, openSlackPanel),
    vscode.commands.registerCommand(
      SelfCommands.CHANGE_WORKSPACE,
      changeWorkspace
    ),
    vscode.commands.registerCommand(SelfCommands.CHANGE_CHANNEL, changeChannel),
    vscode.commands.registerCommand(SelfCommands.SIGN_IN, authenticate),
    vscode.commands.registerCommand(SelfCommands.SIGN_OUT, signout),
    vscode.commands.registerCommand(SelfCommands.RESET_STORE, reset),
    vscode.commands.registerCommand(
      SelfCommands.CONFIGURE_TOKEN,
      configureToken
    ),
    vscode.commands.registerCommand(SelfCommands.SEND_MESSAGE, ({ text }) =>
      sendMessage(text)
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
        channel: store.getChannel(store.lastChannelId),
        user: undefined,
        source: EventSource.slash
      });
    }),
    vscode.commands.registerCommand(
      SelfCommands.LIVE_SHARE_JOIN_PROMPT,
      ({ senderId, messageUri }) => promptVslsJoin(senderId, messageUri)
    ),
    vscode.commands.registerCommand(SelfCommands.FETCH_REPLIES, fetchReplies),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_MESSAGES,
      ({ channelId, messages }) => {
        store.updateMessages(channelId, messages);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.ADD_MESSAGE_REACTION,
      ({ userId, msgTimestamp, channelId, reactionName }) => {
        store.addReaction(channelId, msgTimestamp, userId, reactionName);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.REMOVE_MESSAGE_REACTION,
      ({ userId, msgTimestamp, channelId, reactionName }) => {
        store.removeReaction(channelId, msgTimestamp, userId, reactionName);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_USER_PRESENCE,
      ({ userId, isOnline }) => {
        store.updateUserPresence(userId, isOnline);
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.CHANNEL_MARKED,
      ({ channelId, readTimestamp, unreadCount }) => {
        const channel = store.getChannel(channelId);

        if (!!channel) {
          store.updateChannel({ ...channel, readTimestamp, unreadCount });
          store.updateAllUI();
        }
      }
    ),
    vscode.commands.registerCommand(
      SelfCommands.UPDATE_MESSAGE_REPLIES,
      ({ channelId, parentTimestamp, reply }) => {
        store.updateMessageReply(parentTimestamp, channelId, reply);
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
    vscode.workspace.onDidChangeConfiguration(resetConfiguration),
    vscode.workspace.registerTextDocumentContentProvider(TRAVIS_SCHEME, travis),
    vscode.window.registerUriHandler(uriHandler),
    store,
    reporter
  );
}

export function deactivate() {}
