"use strict";
import * as vscode from "vscode";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "vscode-rubberduck" is now active!'
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand("extension.sayHello", () => {
    // The code you place here will be executed every time your command is executed
    vscode.window.showInformationMessage("Hello World!");
    const panel = vscode.window.createWebviewPanel(
      "catCoding", // Identifies the type of the webview. Used internally
      "Cat Coding", // Title of the panel displayed to the user
      vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
      {} // Webview options. More on these later.
    );

    let messages = [];

    const updateWebview = () => {
      console.log(messages);
      console.log(getWebviewContent(messages));
      panel.webview.html = getWebviewContent(messages);
    };

    // Set initial content
    updateWebview();

    const token =
      "xoxp-282186700213-282087778692-377864597989-88a83d1b455fcf664f0fc8ca8cfcc7c9";

    //     const { WebClient } = require("@slack/client");
    //     const web = new WebClient(token);
    //     web.channels
    //       .list()
    //       .then(res => {
    //         // `res` contains information about the channels
    //         res.channels.forEach(c => console.log(c));
    //       })
    //       .catch(console.error);

    const conversationId = "CBC6RU92P";

    const { RTMClient } = require("@slack/client");
    const rtm = new RTMClient(token);
    rtm.start();
    rtm.on("message", event => {
      // Structure of `event`: <https://api.slack.com/events/message>
      console.log(`Message from ${event.user}: ${event.text}`);
      messages.push(event.text);
      updateWebview();
    });

    rtm
      .sendMessage("Hello there", conversationId)
      .then(res => {
        // `res` contains information about the posted message
        console.log("Message sent: ", res.ts);
      })
      .catch(console.error);
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
</body>
</html>`;
}
