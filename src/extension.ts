import * as vscode from "vscode";
import SlackMessenger from "./messenger";
import ViewController from "./controller";
import Logger from "./logger";
import Reporter from "./telemetry";
import Store from "./store";
import * as str from "./strings";
import { SlackChannel } from "./interfaces";
import { SelfCommands } from "./constants";

let reporter: Reporter | undefined = undefined;
let store: Store | undefined = undefined;
let controller: ViewController | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
  let messenger: SlackMessenger | undefined = undefined;
  store = new Store(context);
  reporter = new Reporter();
  controller = new ViewController(context, () => store.loadChannelHistory());

  store.setUiCallback(uiMessage => controller.sendToUi(uiMessage));

  const askForChannel = (): Thenable<SlackChannel> => {
    const { channels } = store;
    let channelsPromise: Promise<SlackChannel[]>;

    if (!channels) {
      channelsPromise = store.updateChannels();
    } else {
      channelsPromise = new Promise((resolve, _) => resolve(channels));
    }

    return channelsPromise
      .then(channels => {
        let channelList = channels.map(channel => {
          const prefix = channel.type === "im" ? "@" : "#";
          return prefix + channel.name;
        });

        return vscode.window.showQuickPick(channelList, {
          placeHolder: str.CHANGE_CHANNEL_TITLE
        });
      })
      .then(selected => {
        if (selected) {
          const selectedChannel = store.channels.find(
            x => x.name === selected.substr(1)
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
              store.updateUsers(); // update new data async
              return resolve(users);
            })
          : store.updateUsers();
      })
      .then(() => {
        const { channels } = store;
        return channels
          ? new Promise((resolve, _) => {
              store.updateChannels(); // update new data async
              return resolve(channels);
            })
          : store.updateChannels();
      })
      .then(() => {
        return store.lastChannel && store.lastChannel.id
          ? new Promise((resolve, _) => {
              resolve();
            })
          : askForChannel();
      })
      .then(() => {
        messenger.updateCurrentChannel();
      })
      .catch(error => console.error(error));
  };

  const channelChanger = () => {
    reporter.sendChangeChannelEvent();
    return askForChannel().then(
      () => (messenger ? messenger.updateCurrentChannel() : null)
    );
  };

  const resetConfiguration = () => {
    store = new Store(context);
    store.setUiCallback(uiMessage => controller.sendToUi(uiMessage));
    messenger = null;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(SelfCommands.OPEN, openSlackPanel),
    vscode.commands.registerCommand(SelfCommands.CHANGE, channelChanger),
    vscode.workspace.onDidChangeConfiguration(resetConfiguration),
    reporter
  );
}

export function deactivate() {
  if (reporter) {
    // Return promise sync this operation is async
    return reporter.dispose();
  }
}
