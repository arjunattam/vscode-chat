import * as vscode from "vscode";

class SlackUI {
  panel: vscode.WebviewPanel;

  constructor(msgCb) {
    this.panel = vscode.window.createWebviewPanel(
      "slackPanel",
      "Slack",
      vscode.ViewColumn.Three,
      { enableScripts: true }
    );
    this.panel.webview.onDidReceiveMessage(message => msgCb(message));
  }

  update(messages: string[]) {
    this.panel.webview.html = getWebviewContent(messages);
  }
}

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

export default SlackUI;
