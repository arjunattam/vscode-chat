import * as vscode from "vscode";
import SlackUI from "./ui";
import SlackMessenger from "./slack";
import ViewController from "./controller";
import Logger from "./logger";
import { SlackChannel, SlackCurrentUser, SlackUsers } from "./slack/interfaces";

export function activate(context: vscode.ExtensionContext) {
  // Class instances
  let ui: SlackUI | undefined = undefined;
  let messenger: SlackMessenger | undefined = undefined;
  let controller: ViewController | undefined = undefined;

  // Configuration and global state
  let slackToken: string | undefined = undefined;
  let lastChannel: SlackChannel | undefined = undefined;
  let channels: SlackChannel[] | undefined = undefined;
  let currentUserInfo: SlackCurrentUser | undefined = undefined;
  let users: SlackUsers | undefined = undefined;

  const clearConfiguration = () => {
    context.globalState.update("lastChannel", {});
    context.globalState.update("channels", {});
    context.globalState.update("userInfo", {});
    context.globalState.update("users", {});
  };

  const loadConfiguration = () => {
    //
    // Only used for testing
    // clearConfiguration();
    //

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
  };

  const askForChannel = () => {
    let channelList = messenger.manager.channels.map(channel => {
      const prefix = channel.type === "im" ? "@" : "#";
      return prefix + channel.name;
    });

    return vscode.window
      .showQuickPick(channelList, {
        placeHolder: "Select a channel"
      })
      .then(selected => {
        if (selected) {
          const selectedChannel = messenger.manager.channels.find(
            x => x.name === selected.substr(1)
          );

          context.globalState.update("lastChannel", selectedChannel);
          lastChannel = selectedChannel;
          return selectedChannel;
        } else {
          vscode.window.showErrorMessage("Invalid channel selected");
          throw new Error("Invalid channel");
        }
      });
  };

  const loadUi = () => {
    if (ui) {
      ui.reveal();
    } else {
      const { extensionPath } = context;
      ui = new SlackUI(extensionPath);
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
      messenger = new SlackMessenger(slackToken, context);
      controller = null;
    }
  };

  const openSlackPanel = () => {
    Logger.log("Open slack panel");
    loadUi();
    setupMessenger();

    messenger
      .init(users, channels)
      .then(() => {
        return lastChannel && lastChannel.id
          ? new Promise((resolve, _) => {
              resolve();
            })
          : askForChannel();
      })
      .then(() => {
        setupMessagePassing();

        // Setup initial ui
        messenger.setCurrentChannel(lastChannel);

        // Handle tab switching
        ui.panel.onDidChangeViewState(e => {
          controller.sendToUi({
            messages: messenger.messages,
            users: messenger.manager.users,
            channel: messenger.channel
          });
        });

        // When the webview thing disposes
        ui.panel.onDidDispose(e => {
          ui = null;
          controller = null;
        });
      })
      .catch(e => console.error(e));
  };

  const channelChanger = () => {
    return askForChannel().then(
      channel => (messenger ? messenger.setCurrentChannel(channel) : null)
    );
  };

  const resetConfiguration = () => {
    loadConfiguration();
    messenger = null;
    ui = null;
    controller = null;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "extension.chat.openSlackPanel",
      openSlackPanel
    ),
    vscode.commands.registerCommand(
      "extension.chat.changeChannel",
      channelChanger
    ),
    vscode.workspace.onDidChangeConfiguration(resetConfiguration)
  );

  loadConfiguration();
}

export function deactivate() {}
