import * as vscode from "vscode";
import { SelfCommands } from "../constants";
import { EventSource } from "../types";

const CHAT_ICON = "$(comment-discussion)";

export abstract class BaseStatusItem {
  item: vscode.StatusBarItem;
  disposableCommand: vscode.Disposable;
  unreadCount: number = 0;
  isVisible: boolean = false;

  constructor(baseCommand: string) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );

    // We construct a new command to send args with base command
    // From: https://github.com/Microsoft/vscode/issues/22353#issuecomment-325293438
    const compound = `${baseCommand}.status`;
    this.disposableCommand = vscode.commands.registerCommand(compound, () =>
      vscode.commands.executeCommand(baseCommand, {
        source: EventSource.status
      })
    );

    this.item.command = compound;
  }

  abstract updateCount(unreads: number, workspaceName: string): void;

  show() {
    if (!this.isVisible) {
      this.item.show();
      this.isVisible = true;
    }
  }

  hide() {
    if (this.isVisible) {
      this.item.hide();
      this.isVisible = false;
    }
  }

  dispose() {
    this.item.dispose();
    this.disposableCommand.dispose();
  }
}

export class UnreadsStatusItem extends BaseStatusItem {
  constructor() {
    super(SelfCommands.CHANGE_CHANNEL);
  }

  updateCount(unreads: number, workspaceName: string) {
    this.unreadCount = unreads;
    this.item.text = `${CHAT_ICON} ${workspaceName}: ${unreads} new`;
    return this.unreadCount > 0 ? this.show() : this.hide();
  }
}

export class VslsChatStatusItem extends BaseStatusItem {
  defaultText: string = `${CHAT_ICON} Chat`;

  constructor() {
    super(SelfCommands.OPEN_WEBVIEW);
    this.item.text = this.defaultText;
  }

  updateCount(unreads: number, workspaceName: string): void {
    this.unreadCount = unreads;

    if (unreads > 0) {
      this.item.text = `${CHAT_ICON} Chat: ${unreads} new`;
    } else {
      this.item.text = this.defaultText;
    }
  }
}
