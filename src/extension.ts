"use strict";
import * as vscode from "vscode";
import * as path from "path";
import SlackUI from "./ui";
import SlackMessenger from "./slack";
import ViewController from "./slack/controller";
import { SlackChannel } from "./slack/interfaces";

export function activate(context: vscode.ExtensionContext) {
  let ui: SlackUI | undefined = undefined;
  let messenger: SlackMessenger | undefined = undefined;
  let slackToken: string | undefined = undefined;
  let lastChannel: SlackChannel | undefined = undefined;

  const loadConfiguration = () => {
    // https://api.slack.com/custom-integrations/legacy-tokens
    const config = vscode.workspace.getConfiguration("chat");
    const { slack } = config;

    if (slack && slack.legacyToken) {
      slackToken = slack.legacyToken;
    } else {
      vscode.window.showErrorMessage("Slack token not found in settings.");
    }

    lastChannel = context.globalState.get("lastChannel");
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
        }
      });
  };

  let openSlackCommand = vscode.commands.registerCommand(
    "extension.openSlackPanel",
    () => {
      messenger = new SlackMessenger(slackToken);

      messenger
        .init()
        .then(() => {
          return lastChannel.id
            ? new Promise((resolve, reject) => {
                resolve();
              })
            : askForChannel();
        })
        .then(() => {
          if (ui) {
            ui.reveal();
          } else {
            const { extensionPath } = context;
            const baseVuePath = path.join(extensionPath, "src", "ui");
            const staticPath = vscode.Uri.file(baseVuePath).with({
              scheme: "vscode-resource"
            });
            ui = new SlackUI(staticPath);
          }

          // Setup message passing
          const viewController = new ViewController(ui, messenger);
          ui.setMessageHandler(msg => viewController.sendToExtension(msg));
          messenger.setUiCallback(msg => viewController.sendToUi(msg));

          // Setup initial ui
          messenger.setCurrentChannel(lastChannel);

          // Handle tab switching
          ui.panel.onDidChangeViewState(e => {
            console.log("on did view change", e);
            viewController.sendToUi({
              messages: messenger.messages,
              users: messenger.manager.users,
              channel: messenger.channel
            });
          });

          // When the webview thing disposes
          ui.panel.onDidDispose(e => {
            messenger = null;
            ui = null;
          });
        });
    }
  );

  let changeChannelCommand = vscode.commands.registerCommand(
    "extension.changeChannel",
    () => {
      askForChannel().then(channel => messenger.setCurrentChannel(channel));
    }
  );

  context.subscriptions.push(openSlackCommand, changeChannelCommand);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(() => loadConfiguration())
  );

  loadConfiguration();
}

export function deactivate() {}
