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
  const vueImports = `
    <script src="${staticPath}/static.js"></script>
    <link rel="stylesheet" type="text/css" href="${staticPath}/static.css"></link>
  `;

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Slack</title>
      <script src="https://cdn.jsdelivr.net/npm/vue/dist/vue.js"></script>
      ${vueImports}
  </head>
  <body>
      <div id="app" class="vue-container">
          <messages
            v-bind:messages="messages"
            v-bind:users="users">
          </messages>

          <form-section></form-section>
      </div>
  
      <script>
          var app = new Vue({
            el: "#app",
            data: {
              messages: [],
              users: {}
            }
          });

          window.addEventListener('message', event => {
            app.messages = event.data.messages;
            app.users = event.data.users;
          });
      </script>
  </body>
  </html>`;
}

export default SlackUI;
