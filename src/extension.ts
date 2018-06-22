"use strict";
import * as vscode from "vscode";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand("extension.sayHello", () => {
    // The code you place here will be executed every time your command is executed
    const panel = vscode.window.createWebviewPanel(
      "catCoding", // Identifies the type of the webview. Used internally
      "Cat Coding", // Title of the panel displayed to the user
      vscode.ViewColumn.Three,
      { enableScripts: true }
    );

    let messages = [];

    const updateWebview = () => {
      panel.webview.html = getWebviewContent(messages);
    };

    // Set initial content
    updateWebview();

    const token =
      "xoxp-282186700213-282087778692-377864597989-88a83d1b455fcf664f0fc8ca8cfcc7c9";
    const conversationId = "CBC6RU92P";

    const { RTMClient } = require("@slack/client");
    const rtm = new RTMClient(token);
    rtm.start();
    rtm.on("message", event => {
      // Structure of `event`: <https://api.slack.com/events/message>

      // TODO(arjun): maintain users list
      messages.push(`${event.user}: ${event.text}`);
      updateWebview();
    });

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case "send":
            rtm
              .sendMessage(message.text, conversationId)
              .then(result => {
                messages.push(message.text);
                updateWebview();
                console.log("Message sent: ", result.ts);
              })
              .catch(console.error);
            return;
        }
      },
      undefined,
      context.subscriptions
    );
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}

function getWebviewContent(messages) {
  const messagesItems = messages
    .map(message => "<li>" + message + "</li>")
    .join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cat Coding</title>
</head>
<body>
    <ul>
        ${messagesItems}
    </ul>
    <form id="submit-form">
        <input type="text" id="message-input" name="message" value="Enter message">
        <input type="submit" value="Submit">
    </form>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            document.getElementById('submit-form').addEventListener('submit', function(e) {
                e.preventDefault(); //to prevent form submission
                vscode.postMessage({
                    command: 'send',
                    text: document.getElementById('message-input').value
                })
            });
        }())
    </script>
</body>
</html>`;
}
