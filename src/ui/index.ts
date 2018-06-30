import * as vscode from "vscode";
import * as path from "path";
import { ExtensionMessage, UiMessage, SlackChannel } from "../store/interfaces";

class SlackUI {
  panel: vscode.WebviewPanel;
  isVueReady: Boolean = false;
  pendingMessage: UiMessage = undefined;

  constructor(
    public extensionPath,
    public onDidDispose: () => void,
    public onDidChangeViewState: (isVisible: Boolean) => void
  ) {
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
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(baseVuePath)]
      }
    );

    this.panel.webview.html = getWebviewContent(staticPath);

    // Handle on did dispose for webview panel
    this.panel.onDidDispose(() => {
      console.log(this.isVueReady);
      this.isVueReady = false;
      this.onDidDispose();
    });

    // Handle tab switching event
    this.panel.onDidChangeViewState(event => {
      const { visible } = event.webviewPanel;
      this.onDidChangeViewState(visible);
    });
  }

  setMessageHandler(msgHandler: (message: ExtensionMessage) => void) {
    this.panel.webview.onDidReceiveMessage((message: ExtensionMessage) => {
      const { text, type } = message;

      if (type === "internal") {
        // This is an internal message from Vuejs
        switch (text) {
          case "is_ready":
            this.isVueReady = true;

            if (this.pendingMessage) {
              // If we have pending message, we can send it now
              this.update(this.pendingMessage);
            }
          default:
            return;
        }
      } else {
        return msgHandler(message);
      }
    });
  }

  updateTitle(channel: SlackChannel) {
    if (channel) {
      const prefix = channel.type === "im" ? "@" : "#";
      this.panel.title = prefix + channel.name;
    }
  }

  update(message: UiMessage) {
    if (!this.isVueReady) {
      // Vuejs is not ready, so we will store this as a pending
      // message
      this.pendingMessage = message;
    }

    this.panel.webview.postMessage({ ...message });
    this.updateTitle(message.channel);
    this.pendingMessage = null;
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
