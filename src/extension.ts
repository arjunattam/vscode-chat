import * as vscode from "vscode";
import SlackUI from "./ui";
import SlackMessenger from "./slack";
import ViewController from "./controller";
import Logger from "./logger";
import Reporter from "./telemetry";
import Store from "./store";
import { SlackChannel, SlackCurrentUser, SlackUsers } from "./store/interfaces";
import { SelfCommands } from "./constants";

let reporter: Reporter | undefined = undefined;
let store: Store | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
  // Class instances
  let ui: SlackUI | undefined = undefined;
  let messenger: SlackMessenger | undefined = undefined;
  let controller: ViewController | undefined = undefined;

  // Telemetry
  reporter = new Reporter();

  const clearConfiguration = () => {
    context.globalState.update("lastChannel", {});
    context.globalState.update("channels", {});
    context.globalState.update("userInfo", {});
    context.globalState.update("users", {});
  };

  const loadConfiguration = (): Store => {
    //
    // Only used for testing
    // clearConfiguration();
    //

    // Configuration and global state
    let slackToken: string | undefined = undefined;
    let lastChannel: SlackChannel | undefined = undefined;
    let channels: SlackChannel[] | undefined = undefined;
    let currentUserInfo: SlackCurrentUser | undefined = undefined;
    let users: SlackUsers | undefined = undefined;

    const config = vscode.workspace.getConfiguration("chat");
    const { slack } = config;

    if (slack && slack.legacyToken) {
      slackToken = slack.legacyToken;
    } else {
      vscode.window.showErrorMessage("Slack token not found in settings.");
    }

    lastChannel = context.globalState.get("lastChannel");
    channels = context.globalState.get("channels");
    currentUserInfo = context.globalState.get("userInfo");
    users = context.globalState.get("users");

    if (currentUserInfo && slackToken) {
      if (currentUserInfo.token !== slackToken) {
        // Token has changed, all state is suspicious now
        lastChannel = null;
        channels = null;
        currentUserInfo = null;
        users = null;
      }
    }

    // TODO(arjun): maybe don't create a new Store, update existing?
    return new Store(slackToken, lastChannel, channels, currentUserInfo, users);
  };

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

          context.globalState.update("lastChannel", selectedChannel);
          store.lastChannel = selectedChannel;
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

  const setupMessenger = () => {
    if (!messenger) {
      messenger = new SlackMessenger(store.slackToken, context);
      controller = null;
    }
  };

  const openSlackPanel = () => {
    Logger.log("Open slack panel");
    reporter.sendOpenSlackEvent();

    loadUi();
    setupMessenger();

    messenger
      .init(store.users, store.channels)
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
      .catch(e => console.error(e));
  };

  const channelChanger = () => {
    reporter.sendChangeChannelEvent();
    return askForChannel().then(
      channel => (messenger ? messenger.setCurrentChannel(channel) : null)
    );
  };

  const resetConfiguration = () => {
    store = loadConfiguration();
    messenger = null;
    ui = null;
    controller = null;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(SelfCommands.OPEN, openSlackPanel),
    vscode.commands.registerCommand(SelfCommands.CHANGE, channelChanger),
    vscode.workspace.onDidChangeConfiguration(resetConfiguration)
  );

  store = loadConfiguration();
}

export function deactivate() {
  if (reporter) {
    // Return promise sync this operation is async
    return reporter.dispose();
  }
}
