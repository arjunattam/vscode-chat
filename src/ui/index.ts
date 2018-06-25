import * as vscode from "vscode";
import * as path from "path";
import { ExtensionMessage, UiMessage, SlackChannel } from "../slack/interfaces";

class SlackUI {
  panel: vscode.WebviewPanel;

  constructor(public extensionPath) {
    const baseVuePath = path.join(extensionPath, "static");
    const staticPath = vscode.Uri.file(baseVuePath).with({
      scheme: "vscode-resource"
    });

    this.panel = vscode.window.createWebviewPanel(
      "slackPanel",
      "Slack",
      vscode.ViewColumn.Three,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(baseVuePath)]
      }
    );

    this.panel.webview.html = getWebviewContent(staticPath);
  }

  setMessageHandler(msgHandler: (message: ExtensionMessage) => void) {
    this.panel.webview.onDidReceiveMessage(msgHandler);
  }

  updateTitle(channel: SlackChannel) {
    if (channel) {
      const prefix = channel.type === "im" ? "@" : "#";
      this.panel.title = prefix + channel.name;
    }
  }

  update(message: UiMessage) {
    this.panel.webview.postMessage({ ...message });
    this.updateTitle(message.channel);
  }

  reveal() {
    this.panel.reveal();
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
      <div id="app">
          <app-container
            v-bind:messages="messages"
            v-bind:users="users">
          </app-container>
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
