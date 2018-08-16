import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import SlackMessenger from "./messenger";
import ViewController from "./controller";
import Logger from "./logger";
import Store from "./store";
import * as str from "./strings";
import { SlackChannel, ChatArgs } from "./interfaces";
import { SelfCommands, LIVE_SHARE_EXTENSION } from "./constants";
import ChatTreeProviders from "./tree";
import travisProvider, { TRAVIS_URI_SCHEME } from "./providers/travis";

let store: Store | undefined = undefined;
let controller: ViewController | undefined = undefined;
let chatTreeProvider: ChatTreeProviders | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
  let messenger: SlackMessenger | undefined = undefined;
  store = new Store(context);
  controller = new ViewController(
    context,
    () => store.loadChannelHistory(),
    () => store.updateReadMarker()
  );
  store.setUiCallback(uiMessage => controller.sendToUI(uiMessage));

  const askForChannel = (): Promise<SlackChannel> => {
    const { channels } = store;
    let channelsPromise: Promise<SlackChannel[]>;

    if (!channels) {
      channelsPromise = store.fetchChannels();
    } else {
      channelsPromise = new Promise((resolve, _) => resolve(channels));
    }

    return channelsPromise
      .then(() => {
        // TODO: should we use icons for presentation?
        let channelList = store
          .getChannelLabels()
          .sort((a, b) => b.unread - a.unread)
          .map(c => `${c.label}`);

        return vscode.window.showQuickPick(
          [...channelList, str.RELOAD_CHANNELS],
          {
            placeHolder: str.CHANGE_CHANNEL_TITLE
          }
        );
      })
      .then(selected => {
        if (selected) {
          if (selected === str.RELOAD_CHANNELS) {
            return store
              .fetchUsers()
              .then(() => store.fetchChannels())
              .then(() => askForChannel());
          }

          const selectedChannel = store.channels.find(
            x => selected.indexOf(x.name) === 0
          );

          if (!selectedChannel) {
            vscode.window.showErrorMessage(str.INVALID_CHANNEL);
          }

          store.updateLastChannelId(selectedChannel.id);
          return selectedChannel;
        }
      });
  };

  const setupMessenger = (): Promise<void> => {
    if (!messenger) {
      messenger = new SlackMessenger(store);
      controller.setMessenger(messenger);

      return messenger
        .start()
        .then(currentUser => {
          store.updateCurrentUser(currentUser);
          messenger.subscribePresence();
        })
        .catch(error => {
          Logger.log(error);
          return error;
        });
    } else {
      return new Promise((resolve, _) => resolve());
    }
  };

  const shouldFetchNew = (lastFetchedAt: Date): boolean => {
    if (!lastFetchedAt) {
      return true;
    }

    const now = new Date();
    const difference = now.valueOf() - lastFetchedAt.valueOf();
    const FETCH_THRESHOLD = 15 * 60 * 1000; // 15-mins
    return difference > FETCH_THRESHOLD;
  };

  const setupStore = (): Promise<any> => {
    const { users, usersFetchedAt } = store;
    const usersPromise = !!users
      ? new Promise(resolve => {
          if (shouldFetchNew(usersFetchedAt)) {
            // async update
            store.fetchUsers();
          }
          resolve(users);
        })
      : store.fetchUsers();

    return usersPromise.then(users => {
      const { channels, channelsFetchedAt } = store;

      if (!!messenger) {
        messenger.subscribePresence();
      }

      const channelsPromise = !!channels
        ? new Promise(resolve => {
            if (shouldFetchNew(channelsFetchedAt)) {
              // async update
              store.fetchChannels();
            }
            resolve(channels);
          })
        : store.fetchChannels();

      return channelsPromise;
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

    setupMessenger()
      .then(() => setupStore())
      .then(() => getChatChannelId(args))
      .then(() => {
        store.updateUi();
        store.loadChannelHistory();
      })
      .catch(error => console.error(error));
  };

  const changeSlackChannel = () => {
    return askForChannel().then(() => {
      if (controller.isUILoaded()) {
        store.loadChannelHistory();
        store.updateUi();
      } else {
        openSlackPanel();
      }
    });
  };

  const shareVslsLink = async (args?: ChatArgs) => {
    const liveshare = await vsls.getApiAsync();
    // liveshare.share() creates a new session if required
    const vslsUri = await liveshare.share({ suppressNotification: true });

    if (!messenger) {
      await setupMessenger();
    }

    let channelId: string = await getChatChannelId(args);
    messenger.sendMessageToChannel(vslsUri.toString(), channelId);
  };

  const resetConfiguration = () => {
    if (!!store) {
      store.dispose(); // Removes the old status item
    }

    store = new Store(context);
    store.setUiCallback(uiMessage => controller.sendToUI(uiMessage));

    if (!!chatTreeProvider) {
      chatTreeProvider.updateStore(store);
    }

    store.updateTreeViews();
    messenger = null;
    setupStore();
    setupMessenger();
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

  // Setup RTM messenger to get real-time unreads and presence updates
  setupMessenger();
  setupStore();

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
    store.dispose();
  }
}
