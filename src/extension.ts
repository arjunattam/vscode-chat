import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import SlackMessenger from "./messenger";
import ViewController from "./controller";
import Store from "./store";
import Logger from "./logger";
import * as str from "./strings";
import {
  SlackChannel,
  ChatArgs,
  SlackCurrentUser,
  EventType,
  EventSource
} from "./interfaces";
import { SelfCommands, SLACK_OAUTH } from "./constants";
import { VSLS_EXTENSION_ID, CONFIG_ROOT, TRAVIS_SCHEME } from "./constants";
import ChatTreeProviders from "./tree";
import travis from "./providers/travis";
import { ExtensionUriHandler } from "./uri";
import { openUrl, getExtension } from "./utils";
import ConfigHelper from "./config";
import Reporter from "./telemetry";

let store: Store | undefined = undefined;
let controller: ViewController | undefined = undefined;
let chatTreeProvider: ChatTreeProviders | undefined = undefined;
let messenger: SlackMessenger | undefined = undefined;
let reporter: Reporter | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
  store = new Store(context);
  reporter = new Reporter(store);

  controller = new ViewController(
    context,
    () => store.loadChannelHistory(store.lastChannelId),
    () => store.updateReadMarker(),
    text => sendMessage(text)
  );
  store.setUiCallback(uiMessage => controller.sendToUI(uiMessage));

  const setup = (): Promise<any> => {
    let messengerPromise: Promise<SlackCurrentUser>;
    const isConnected = !!messenger && messenger.isConnected();
    const hasUser = !!store.currentUserInfo;

    if (!store.installationId) {
      store.generateInstallationId();
      const { installationId } = store;
      reporter.setUniqueId(installationId);

      if (!hasUser) {
        reporter.record(EventType.extensionInstalled, undefined, undefined);
      }
    }

    if (isConnected && hasUser) {
      messengerPromise = Promise.resolve(store.currentUserInfo);
    } else {
      messenger = new SlackMessenger(store);
      messengerPromise = messenger.start();
    }

    return messengerPromise
      .then(currentUser => {
        store.updateCurrentUser(currentUser);
        return store.getUsersPromise();
      })
      .then(() => {
        // Presence subscription assumes we have store.users
        messenger.subscribePresence();
        return store.getChannelsPromise();
      })
      .catch(error => Logger.log(error));
  };

  const sendMessage = (text: string): Promise<void> => {
    if (!!messenger) {
      const { lastChannelId } = store;
      reporter.record(EventType.messageSent, undefined, lastChannelId);
      return messenger.sendMessage(text, lastChannelId);
    }
  };

  const askForChannel = (): Promise<SlackChannel> => {
    return setup().then(() => {
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
            store.updateLastChannelId(selectedChannel.id);
            return selectedChannel;
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
    controller.loadUi();

    setup()
      .then(() => getChatChannelId(args))
      .then(() => {
        store.updateWebviewUI();
        const { lastChannelId } = store;
        const hasArgs = !!args && !!args.source;
        reporter.record(
          EventType.viewOpened,
          hasArgs ? args.source : EventSource.palette,
          lastChannelId
        );
        store.loadChannelHistory(lastChannelId);
      })
      .catch(error => console.error(error));
  };

  const changeChannel = (args?: any) => {
    const hasArgs = !!args && !!args.source;
    reporter.record(
      EventType.channelChanged,
      hasArgs ? args.source : EventSource.palette,
      undefined
    );
    return askForChannel().then(() => openSlackPanel());
  };

  const shareVslsLink = async (args?: ChatArgs) => {
    const liveshare = await vsls.getApiAsync();
    // liveshare.share() creates a new session if required
    const vslsUri = await liveshare.share({ suppressNotification: true });

    if (!messenger) {
      await setup();
    }

    let channelId: string = await getChatChannelId(args);
    // TODO: we are not tracking `/live share` events
    reporter.record(EventType.vslsShared, EventSource.activity, channelId);
    messenger.sendMessage(vslsUri.toString(), channelId);
  };

  const authenticate = (args?: any) => {
    const hasArgs = !!args && !!args.source;
    reporter.record(
      EventType.authStarted,
      hasArgs ? args.source : EventSource.palette,
      undefined
    );
    return openUrl(SLACK_OAUTH);
  };

  const resetConfiguration = (event: vscode.ConfigurationChangeEvent) => {
    const affectsExtension = event.affectsConfiguration(CONFIG_ROOT);

    if (affectsExtension) {
      store.reset();
      setup();
      store.updateAllUI();
    }
  };

  const setVslsContext = () => {
    const vsls = getExtension(VSLS_EXTENSION_ID);
    const isEnabled = !!vsls;

    if (isEnabled) {
      vscode.commands.executeCommand("setContext", "chat:vslsEnabled", true);
    } else {
      vscode.commands.executeCommand("setContext", "chat:vslsEnabled", false);
    }
  };

  const configureToken = () => {
    reporter.record(EventType.tokenConfigured, EventSource.palette, undefined);
    vscode.window
      .showInputBox({
        placeHolder: str.TOKEN_PLACEHOLDER,
        password: true
      })
      .then(input => {
        if (!!input) {
          return ConfigHelper.setToken(input);
        }
      });
  };

  // Setup tree providers
  chatTreeProvider = new ChatTreeProviders(store);
  const treeDisposables: vscode.Disposable[] = chatTreeProvider.register();

  // Setup real-time messenger and updated local state
  setup();

  // Setup context for conditional views
  setVslsContext();

  const uriHandler = new ExtensionUriHandler();
  context.subscriptions.push(
    vscode.commands.registerCommand(SelfCommands.OPEN, openSlackPanel),
    vscode.commands.registerCommand(SelfCommands.CHANGE_CHANNEL, changeChannel),
    vscode.commands.registerCommand(SelfCommands.SIGN_IN, authenticate),
    vscode.commands.registerCommand(
      SelfCommands.CONFIGURE_TOKEN,
      configureToken
    ),
    vscode.commands.registerCommand(SelfCommands.LIVE_SHARE, item =>
      shareVslsLink({
        channel: item.channel,
        user: item.user,
        source: EventSource.activity
      })
    ),
    vscode.workspace.onDidChangeConfiguration(resetConfiguration),
    vscode.workspace.registerTextDocumentContentProvider(TRAVIS_SCHEME, travis),
    vscode.window.registerUriHandler(uriHandler),
    ...treeDisposables,
    store,
    reporter
  );
}

export function deactivate() {}
