import * as vscode from "vscode";
import { ExtensionMessage, UiMessage } from "../slack/interfaces";

class SlackUI {
  panel: vscode.WebviewPanel;

  constructor(public staticPath) {
    this.panel = vscode.window.createWebviewPanel(
      "slackPanel",
      "Slack",
      vscode.ViewColumn.Three,
      { enableScripts: true }
    );

    this.panel.webview.html = getWebviewContent(staticPath);
  }

  setMessageHandler(msgHandler: (message: ExtensionMessage) => void) {
    this.panel.webview.onDidReceiveMessage(message => msgHandler(message));
  }

  update(message: UiMessage) {
    this.panel.webview.postMessage({ ...message });
  }
}

function getWebviewContent(staticPath) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Slack</title>
      <script src="https://cdn.jsdelivr.net/npm/vue/dist/vue.js"></script>
      <script src="${staticPath}"></script>
  </head>
  <body>
      <form id="submit-form">
          <input type="text" id="message-input" name="message" value="Enter message">
          <input type="submit" value="Submit">
      </form>
      <div id="app">
          <message-item
              v-for="message in messages"
              v-bind:key="message.text"
              v-bind:message="message">
          </message-item>
      </div>
  
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

          var app = new Vue({
            el: "#app",
            data: {
              messages: [],
              users: {}
            }
          });

          // Handle the message inside the webview
          window.addEventListener('message', event => {
            app.messages = event.data.messages;
            app.users = event.data.users;
          });
      </script>
  </body>
  </html>`;
}

export default SlackUI;
