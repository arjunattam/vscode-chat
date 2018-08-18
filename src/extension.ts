import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import SlackMessenger from "./messenger";
import ViewController from "./controller";
import Logger from "./logger";
import Store from "./store";
import * as str from "./strings";
import { SlackChannel, ChatArgs } from "./interfaces";
import { SelfCommands, LIVE_SHARE_EXTENSION, CONFIG_ROOT } from "./constants";
import ChatTreeProviders from "./tree";
import travisProvider, { TRAVIS_URI_SCHEME } from "./providers/travis";

let store: Store | undefined = undefined;
let controller: ViewController | undefined = undefined;
let chatTreeProvider: ChatTreeProviders | undefined = undefined;
let messenger: SlackMessenger | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
  store = new Store(context);
  controller = new ViewController(
    context,
    () => store.loadChannelHistory(store.lastChannelId),
    () => store.updateReadMarker()
  );
  store.setUiCallback(uiMessage => controller.sendToUI(uiMessage));

  const askForChannel = (): Promise<SlackChannel> => {
    return store
      .getUsersPromise()
      .then(() => store.getChannelsPromise())
      .then(() => {
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
              const selectedChannel = channelList.find(
                x => x.label === selected
              );
              store.updateLastChannelId(selectedChannel.id);
              return selectedChannel;
            }
          });
      });
  };

  const setup = (): Promise<any> => {
    messenger = new SlackMessenger(store);
    controller.setMessenger(messenger);

    // This will re-start messenger again. Is that ok?
    return messenger
      .start()
      .then(currentUser => {
        store.updateCurrentUser(currentUser);
        messenger.subscribePresence();
        return store.getUsersPromise();
      })
      .then(() => store.getChannelsPromise());
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
        store.loadChannelHistory(lastChannelId);
      })
      .catch(error => console.error(error));
  };

  const changeSlackChannel = () => {
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
    messenger.sendMessageToChannel(vslsUri.toString(), channelId);
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
    const vsls = vscode.extensions.getExtension(LIVE_SHARE_EXTENSION);
    const isEnabled = !!vsls;

    if (isEnabled) {
      vscode.commands.executeCommand("setContext", "chat:vslsEnabled", true);
    } else {
      vscode.commands.executeCommand("setContext", "chat:vslsEnabled", false);
    }
  };

  const disposableProvider = vscode.workspace.registerTextDocumentContentProvider(
    TRAVIS_URI_SCHEME,
    travisProvider
  );

  // Setup tree providers
  chatTreeProvider = new ChatTreeProviders(store);
  const treeDisposables: vscode.Disposable[] = chatTreeProvider.register();

  // Setup real-time messenger and updated local state
  setup();

  // Setup context for conditional views
  setVslsContext();

  context.subscriptions.push(
    vscode.commands.registerCommand(SelfCommands.OPEN, openSlackPanel),
    vscode.commands.registerCommand(SelfCommands.CHANGE, changeSlackChannel),
    vscode.commands.registerCommand(SelfCommands.LIVE_SHARE, item =>
      shareVslsLink({ channel: item.channel, user: item.user })
    ),
    vscode.workspace.onDidChangeConfiguration(resetConfiguration),
    disposableProvider,
    ...treeDisposables
  );
}

export function deactivate() {
  if (store) {
    store.disposeStatusItem();
  }
}
