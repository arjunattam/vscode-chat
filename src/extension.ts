import * as vscode from "vscode";
import SlackUI from "./ui";
import SlackMessenger from "./messenger";
import ViewController from "./controller";
import Logger from "./logger";
import Reporter from "./telemetry";
import Store from "./store";
import { SlackChannel } from "./store/interfaces";
import { SelfCommands } from "./constants";

let reporter: Reporter | undefined = undefined;
let store: Store | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
  // Class instances
  let ui: SlackUI | undefined = undefined;
  let messenger: SlackMessenger | undefined = undefined;
  let controller: ViewController | undefined = undefined;

  // Store
  store = new Store(context);

  // Telemetry
  reporter = new Reporter();

  const askForChannel = (): Thenable<SlackChannel> => {
    const { channels } = store;

    if (!channels) {
      // TODO(arjun): in the first launch, this list will be empty
      vscode.window.showInformationMessage(
        "No channels found. Have you tried Slack: Open?"
      );
      return;
    }

    let channelList = channels.map(channel => {
      const prefix = channel.type === "im" ? "@" : "#";
      return prefix + channel.name;
    });

    return vscode.window
      .showQuickPick(channelList, {
        placeHolder: "Select a channel"
      })
      .then(selected => {
        if (selected) {
          const selectedChannel = channels.find(
            x => x.name === selected.substr(1)
          );
          store.updateLastChannel(selectedChannel);
          return selectedChannel;
        } else {
          vscode.window.showErrorMessage("Invalid channel selected");
        }
      });
  };

  const loadUi = () => {
    if (ui) {
      ui.reveal();
    } else {
      const { extensionPath } = context;
      const onDidViewChange = isVisible => {
        if (isVisible) {
          return messenger ? messenger.loadHistory() : null;
        }
      };
      const onDidDispose = () => {
        ui = null;
        controller = null;
      };
      ui = new SlackUI(extensionPath, onDidDispose, onDidViewChange);
    }
  };

  const setupMessagePassing = () => {
    if (!controller) {
      controller = new ViewController(ui, messenger);
      ui.setMessageHandler(controller.sendToExtension);
      messenger.setUiCallback(msg => controller.sendToUi(msg));
    }
  };

  const setupMessenger = (): Promise<void> => {
    if (!messenger) {
      messenger = new SlackMessenger(store);
      controller = null;

      return messenger
        .start()
        .then(currentUser => {
          store.updateCurrentUser(currentUser);
        })
        .catch(error => {
          Logger.log(error);
          return error;
        });
    }
  };

  const openSlackPanel = () => {
    reporter.sendOpenSlackEvent();

    // UI
    loadUi();

    // Messenger
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
        setupMessagePassing();
        messenger.setCurrentChannel(store.lastChannel);
      })
      .catch(error => console.error(error));
  };

  const channelChanger = () => {
    reporter.sendChangeChannelEvent();
    return askForChannel().then(
      channel => (messenger ? messenger.setCurrentChannel(channel) : null)
    );
  };

  const resetConfiguration = () => {
    store = new Store(context);
    messenger = null;
    ui = null;
    controller = null;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(SelfCommands.OPEN, openSlackPanel),
    vscode.commands.registerCommand(SelfCommands.CHANGE, channelChanger),
    vscode.workspace.onDidChangeConfiguration(resetConfiguration)
  );
}

export function deactivate() {
  if (reporter) {
    // Return promise sync this operation is async
    return reporter.dispose();
  }
}
