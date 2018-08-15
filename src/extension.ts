import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import SlackMessenger from "./messenger";
import ViewController from "./controller";
import Logger from "./logger";
import Reporter from "./telemetry";
import Store from "./store";
import * as str from "./strings";
import { SlackChannel } from "./interfaces";
import { SelfCommands } from "./constants";
import ChannelTreeProvider from "./tree";
import travisProvider, { TRAVIS_URI_SCHEME } from "./providers/travis";

let reporter: Reporter | undefined = undefined;
let store: Store | undefined = undefined;
let controller: ViewController | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
  let messenger: SlackMessenger | undefined = undefined;
  store = new Store(context);
  reporter = new Reporter();
  controller = new ViewController(
    context,
    () => store.loadChannelHistory(),
    () => store.updateReadMarker()
  );

  store.setUiCallback(uiMessage => controller.sendToUI(uiMessage));

  const askForChannel = (): Thenable<SlackChannel> => {
    const { channels } = store;
    let channelsPromise: Promise<SlackChannel[]>;

    if (!channels) {
      channelsPromise = store.fetchChannels();
    } else {
      channelsPromise = new Promise((resolve, _) => resolve(channels));
    }

    return channelsPromise
      .then(() => {
        let channelList = store.getChannelLabels().map(c => c.label);
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

          store.updateLastChannel(selectedChannel);
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
        })
        .catch(error => {
          Logger.log(error);
          return error;
        });
    } else {
      return new Promise((resolve, _) => resolve());
    }
  };

  const openSlackPanel = (args?) => {
    let selectedChannelId: string = store.lastChannelId;

    if (!!args && !!args.channel) {
      const { channel } = args;
      store.updateLastChannel(channel);
      selectedChannelId = channel.id;
    }

    reporter.sendOpenSlackEvent();
    controller.loadUi();

    setupMessenger()
      .then(() => {
        const { users } = store;
        return users
          ? new Promise((resolve, _) => {
              store.fetchUsers(); // update new data async
              return resolve(users);
            })
          : store.fetchUsers();
      })
      .then(() => {
        const { channels } = store;
        // We will have users here, so subscribing for presence updates
        // TODO: this will break if the sidebar is opened and webview is closed
        messenger.subscribePresence();
        return channels
          ? new Promise((resolve, _) => {
              store.fetchChannels(); // update new data async
              return resolve(channels);
            })
          : store.fetchChannels();
      })
      .then(() => {
        return !!selectedChannelId
          ? new Promise((resolve, _) => {
              resolve();
            })
          : askForChannel();
      })
      .then(() => {
        store.loadChannelHistory();
      })
      .catch(error => console.error(error));
  };

  const channelChanger = () => {
    reporter.sendChangeChannelEvent();
    return askForChannel().then(() => {
      if (controller.isUILoaded()) {
        store.loadChannelHistory();
        store.updateUi();
      } else {
        openSlackPanel();
      }
    });
  };

  const shareVslsLink = async (args?) => {
    const liveshare = await vsls.getApiAsync();
    // TODO: what happens if the vsls extension is not available?
    let channelId: string;

    if (!!args && !!args.channel) {
      channelId = args.channel.value;
    } else {
      // askForChannel also sets this as a the last channel. Is that ok?
      const channel = await askForChannel();
      channelId = channel.id;
    }

    // share() creates a new session if required
    const vslsUri = await liveshare.share({ suppressNotification: true });

    if (!messenger) {
      await setupMessenger();
    }

    messenger.sendMessageToChannel(vslsUri.toString(), channelId);
  };

  const resetConfiguration = () => {
    store = new Store(context);
    store.setUiCallback(uiMessage => controller.sendToUI(uiMessage));
    messenger = null;
  };

  const disposableProvider = vscode.workspace.registerTextDocumentContentProvider(
    TRAVIS_URI_SCHEME,
    travisProvider
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(SelfCommands.OPEN, openSlackPanel),
    vscode.commands.registerCommand(SelfCommands.CHANGE, channelChanger),
    vscode.commands.registerCommand(SelfCommands.LIVE_SHARE, channelItem =>
      shareVslsLink({ channel: channelItem })
    ),
    vscode.workspace.onDidChangeConfiguration(resetConfiguration),
    reporter,
    disposableProvider
  );

  const treeProvider = new ChannelTreeProvider(store);
  vscode.window.registerTreeDataProvider("channels-tree-view", treeProvider);
}

export function deactivate() {
  if (store) {
    store.dispose();
  }

  if (reporter) {
    // Return promise sync this operation is async
    return reporter.dispose();
  }
}
