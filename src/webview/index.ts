import * as vscode from "vscode";
import * as path from "path";
import {
  ExtensionMessage,
  UIMessage,
  UIMessageGroup,
  UIMessageDateGroup,
  SlackChannelMessages,
  SlackUsers,
  SlackChannel
} from "../interfaces";

const SAME_GROUP_TIME = 5 * 60; // seconds

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
      vscode.ViewColumn.Beside,
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

  update(uiMessage: UIMessage) {
    const { messages, users, channel } = uiMessage;
    const annotated = this.getAnnotatedMessages(messages, channel);
    const groups = this.getMessageGroups(annotated, users);
    console.log(groups);
    this.panel.webview.postMessage({ ...uiMessage, messages: groups });
    this.panel.title = channel.name;
  }

  reveal() {
    this.panel.reveal();
  }

  getLocaleDateString(date: Date) {
    // Returns ISO-format date string for a given date
    let month = (date.getMonth() + 1).toString();
    let day = date.getDate().toString();

    if (month.length === 1) {
      month = `0${month}`;
    }

    if (day.length === 1) {
      day = `0${day}`;
    }

    return `${date.getFullYear()}-${month}-${day}`;
  }

  getAnnotatedMessages(
    messages: SlackChannelMessages,
    channel: SlackChannel
  ): SlackChannelMessages {
    // Annotate every message with isUnread (boolean)
    const { readTimestamp } = channel;
    let result = {};
    Object.keys(messages).forEach(ts => {
      const message = messages[ts];
      const isUnread = +ts > +readTimestamp;
      result[ts] = { ...message, isUnread };
    });
    return result;
  }

  getMessageGroups(
    input: SlackChannelMessages,
    users: SlackUsers
  ): UIMessageDateGroup[] {
    let result = {};
    Object.keys(input).forEach(ts => {
      const date = new Date(+ts * 1000);
      const dateStr = this.getLocaleDateString(date);
      if (!(dateStr in result)) {
        result[dateStr] = {};
      }
      result[dateStr][ts] = input[ts];
    });
    return Object.keys(result)
      .sort((a, b) => a.localeCompare(b))
      .map(date => {
        const messages = result[date];
        const groups = this.getMessageGroupsForDate(messages, users);
        return {
          groups,
          date
        };
      });
  }

  getMessageGroupsForDate(
    input: SlackChannelMessages,
    users: SlackUsers
  ): UIMessageGroup[] {
    const timestamps = Object.keys(input).sort((a, b) => +a - +b); // ascending

    const initial = {
      current: {},
      groups: []
    };

    const result = timestamps.reduce((accumulator: any, ts) => {
      const { current, groups } = accumulator;
      const message = input[ts];
      const isSameUser = current.userId
        ? message.userId === current.userId
        : false;
      const isSameTime = current.ts
        ? +ts - +current.ts < SAME_GROUP_TIME
        : false;

      if (isSameUser && isSameTime) {
        return {
          groups,
          current: {
            ...current,
            ts,
            messages: [...current.messages, message]
          }
        };
      } else {
        const currentGroup = {
          messages: [message],
          userId: message.userId,
          user: users[message.userId],
          minTimestamp: ts,
          ts,
          key: ts
        };
        return {
          groups: current.ts ? [...groups, current] : [...groups],
          current: currentGroup
        };
      }
    }, initial);

    const { current, groups } = result;
    return current.ts ? [...groups, current] : groups;
  }
}

function getWebviewContent(staticPath) {
  const vueImports = `
    <script src="${staticPath}/static.js"></script>
    <link rel="stylesheet" type="text/css" href="${staticPath}/static.css"></link>
  `;
  const { fontFamily, fontSize } = vscode.workspace.getConfiguration("editor");

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Slack</title>
      <script src="https://cdn.jsdelivr.net/npm/vue/dist/vue.js"></script>
      <style>code { font-family: ${fontFamily} }</style>
      <style>body { font-size: ${fontSize}px; }</style>
      ${vueImports}
  </head>
  <body>
      <div id="app">
          <app-container
            v-bind:messages="messages"
            v-bind:users="users"
            v-bind:channel="channel"
            v-bind:status="statusText">
          </app-container>
      </div>
  
      <script>
          var app = new Vue({
            el: "#app",
            data: {
              messages: [],
              users: {},
              channel: {},
              statusText: ""
            }
          });

          window.addEventListener('message', event => {
            app.messages = event.data.messages;
            app.users = event.data.users;
            app.channel = event.data.channel
            app.statusText = event.data.statusText
          });
      </script>
  </body>
  </html>`;
}
