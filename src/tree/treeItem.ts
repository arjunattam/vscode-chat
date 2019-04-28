import * as vscode from "vscode";
import * as path from "path";
import { SelfCommands, EXTENSION_ID } from "../constants";

const selfExtension = vscode.extensions.getExtension(EXTENSION_ID) as vscode.Extension<any>;
const BASE_PATH = path.join(selfExtension.extensionPath, "public", "icons", "presence");

const PRESENCE_ICONS = {
  green: path.join(BASE_PATH, "green.svg"),
  red: path.join(BASE_PATH, "red.svg"),
  yellow: path.join(BASE_PATH, "yellow.svg")
};

export class WorkspaceTreeItem extends vscode.TreeItem {
  constructor(label: string, provider: string, team: Team | undefined) {
    super(label);

    if (!!team) {
      this.command = {
        command: SelfCommands.CHANGE_WORKSPACE,
        title: "",
        arguments: [{ team, provider }]
      };
    }
  }
}

export class ChannelTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    presence: UserPresence,
    isCategory: boolean,
    providerName: string,
    channel?: Channel,
    user?: User
  ) {
    super(label);

    if (!!channel) {
      // This is a channel item
      this.contextValue = "channel";
      const chatArgs: ChatArgs = {
        channelId: channel ? channel.id : undefined,
        user,
        providerName,
        source: EventSource.activity
      };
      this.command = {
        command: SelfCommands.OPEN_WEBVIEW,
        title: "",
        arguments: [chatArgs]
      };
    }

    switch (presence) {
      case UserPresence.available:
        this.iconPath = {
          light: PRESENCE_ICONS.green,
          dark: PRESENCE_ICONS.green
        };
        break;
      case UserPresence.doNotDisturb:
        this.iconPath = {
          light: PRESENCE_ICONS.red,
          dark: PRESENCE_ICONS.red
        };
        break;
      case UserPresence.idle:
        this.iconPath = {
          light: PRESENCE_ICONS.yellow,
          dark: PRESENCE_ICONS.yellow
        };
        break;
    }

    if (isCategory) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
  }
}
