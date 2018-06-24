"use strict";
import * as vscode from "vscode";
import * as path from "path";
import SlackUI from "./ui";
import SlackMessenger from "./slack";
import ViewController from "./slack/controller";
import { ChannelType } from "./slack/interfaces";

const token =
  "xoxp-282186700213-282087778692-377864597989-88a83d1b455fcf664f0fc8ca8cfcc7c9";
const conversationId = "CBC6RU92P";

export function activate(context: vscode.ExtensionContext) {
  let ui: SlackUI | undefined = undefined;
  let messenger: SlackMessenger | undefined = undefined;

  let openSlackCommand = vscode.commands.registerCommand(
    "extension.openSlackPanel",
    () => {
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

      const defaultChannel = {
        id: conversationId,
        name: "test-channel",
        type: ChannelType.channel
      };
      messenger = new SlackMessenger(token, defaultChannel);
      const viewController = new ViewController(ui, messenger);

      // Setup message passing
      ui.setMessageHandler(msg => viewController.sendToExtension(msg));
      messenger.setUiCallback(msg => viewController.sendToUi(msg));

      // Setup initial ui
      messenger.loadHistory();

      // Handle tab switching
      ui.panel.onDidChangeViewState(e => {
        viewController.sendToUi({
          messages: messenger.messages,
          users: messenger.manager.users
        });
      });
    }
  );

  let changeChannelCommand = vscode.commands.registerCommand(
    "extension.changeChannel",
    () => {
      let channelList = messenger.manager.channels.map(channel => {
        const prefix = channel.type === "im" ? "@" : "#";
        return prefix + channel.name;
      });
      vscode.window
        .showQuickPick(channelList, {
          placeHolder: "Select a channel"
        })
        .then(selected => {
          if (selected) {
            const selectedChannel = messenger.manager.channels.find(
              x => x.name === selected.substr(1)
            );
            messenger.setCurrentChannel(selectedChannel);
          }
        });
    }
  );

  context.subscriptions.push(openSlackCommand, changeChannelCommand);
}

export function deactivate() {}
