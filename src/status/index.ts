import * as vscode from "vscode";
import { SelfCommands } from "../constants";
import { EventSource } from "../types";

const CHAT_ICON = "$(comment-discussion)";

export interface IStatusItem {
  updateCount(unreads: number, workspaceName: string): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

export class UnreadsStatusItem implements IStatusItem {
  item: vscode.StatusBarItem;
  disposableCommand: vscode.Disposable;
  unreadCount: number = 0;
  isVisible: Boolean = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );

    // We construct a new command to send args with base command
    // From: https://github.com/Microsoft/vscode/issues/22353#issuecomment-325293438
    const baseCommand = SelfCommands.CHANGE_CHANNEL;
    const compound = `${baseCommand}.status`;
    this.disposableCommand = vscode.commands.registerCommand(compound, () =>
      vscode.commands.executeCommand(baseCommand, {
        source: EventSource.status
      })
    );

    this.item.command = compound;
  }

  updateCount(unreads: number, workspaceName: string) {
    this.unreadCount = unreads;
    this.item.text = `${CHAT_ICON} ${workspaceName}: ${unreads} new`;
    return this.unreadCount > 0 ? this.show() : this.hide();
  }

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
