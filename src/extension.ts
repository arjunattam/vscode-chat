"use strict";
import * as vscode from "vscode";
import SlackUI from "./ui";
import SlackMessenger from "./slack/messenger";

const token =
  "xoxp-282186700213-282087778692-377864597989-88a83d1b455fcf664f0fc8ca8cfcc7c9";
const conversationId = "CBC6RU92P";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "extension.openSlack",
    () => {
      // The code you place here will be executed every time your command is executed
      const messenger = new SlackMessenger(token, conversationId);
      const ui = new SlackUI(message => {
        switch (message.command) {
          case "send":
            messenger.sendMessage(message.text, messages =>
              ui.update(messages)
            );
            return;
        }
      });

      messenger.setOnMessage(messages => {
        ui.update(messages);
      });

      ui.update([]);
    }
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
