import * as vscode from "vscode";
import SlackMessenger from "./messenger";
import ViewController from "./controller";
import Logger from "./logger";
import Reporter from "./telemetry";
import Store from "./store";
import * as str from "./strings";
import { SlackChannel } from "./interfaces";
import { SelfCommands } from "./constants";
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
      .then(channels => {
        let channelList = channels
          .map(channel => ({
            name: channel.name,
            unread: store.getUnreadCount(channel)
          }))
          .sort((a, b) => b.unread - a.unread)
          .map(
            channel =>
              `${channel.name} ${
                channel.unread > 0 ? `(${channel.unread} new)` : ""
              }`
          );
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

  const openSlackPanel = () => {
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
        return channels
          ? new Promise((resolve, _) => {
              store.fetchChannels(); // update new data async
              return resolve(channels);
            })
          : store.fetchChannels();
      })
      .then(() => {
        return !!store.lastChannelId
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
    vscode.workspace.onDidChangeConfiguration(resetConfiguration),
    reporter,
    disposableProvider
  );
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
