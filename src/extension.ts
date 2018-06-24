"use strict";
import * as vscode from "vscode";
import * as path from "path";
import SlackUI from "./ui";
import SlackMessenger from "./slack";
import ViewController from "./slack/controller";

const token =
  "xoxp-282186700213-282087778692-377864597989-88a83d1b455fcf664f0fc8ca8cfcc7c9";
const conversationId = "CBC6RU92P";

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "extension.openSlack",
    () => {
      const { extensionPath } = context;
      const vueJsPath = path.join(extensionPath, "src", "ui", "static.js");
      const staticPath = vscode.Uri.file(vueJsPath).with({
        scheme: "vscode-resource"
      });
      const ui = new SlackUI(staticPath);

      const messenger = new SlackMessenger(token, conversationId);
      const viewController = new ViewController(ui, messenger);

      // Setup message passing
      ui.setMessageHandler(msg => viewController.sendToExtension(msg));
      messenger.setUiCallback(msg => viewController.sendToUi(msg));

      // Setup initial ui
      messenger.loadHistory();
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
