import * as vscode from "vscode";
import * as path from "path";
import { ExtensionMessage, UiMessage } from "../interfaces";

export default class WebviewContainer {
  panel: vscode.WebviewPanel;

  constructor(
    extensionPath: string,
    private onDidDispose: () => void,
    private onDidChangeViewState: (isVisible: Boolean) => void
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
    this.panel.onDidDispose(() => this.onDidDispose());

    // Handle tab switching event
    this.panel.onDidChangeViewState(event => {
      const { visible } = event.webviewPanel;
      this.onDidChangeViewState(visible);
    });
  }

  setMessageHandler(msgHandler: (message: ExtensionMessage) => void) {
    this.panel.webview.onDidReceiveMessage((message: ExtensionMessage) =>
      msgHandler(message)
    );
  }

  update(message: UiMessage) {
    this.panel.webview.postMessage({ ...message });
    this.panel.title = message.channelName;
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
  const { fontFamily } = vscode.workspace.getConfiguration("editor");

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Slack</title>
      <script src="https://cdn.jsdelivr.net/npm/vue/dist/vue.js"></script>
      <style>code { font-family: ${fontFamily} }</style>
      ${vueImports}
  </head>
  <body>
      <div id="app">
          <app-container
            v-bind:messages="messages"
            v-bind:users="users"
            v-bind:channel="channelName">
          </app-container>
      </div>
  
      <script>
          var app = new Vue({
            el: "#app",
            data: {
              messages: [],
              users: {},
              channelName: ""
            }
          });

          window.addEventListener('message', event => {
            app.messages = event.data.messages;
            app.users = event.data.users;
            app.channelName = event.data.channelName
          });
      </script>
  </body>
  </html>`;
}
