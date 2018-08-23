import * as vscode from "vscode";
import { SelfCommands } from "./constants";
import { EventSource } from "./interfaces";

const OCTICON = "$(comment-discussion)";
const BASE_COMMAND = SelfCommands.CHANGE_CHANNEL;
const COMPOUND_COMMAND = `${BASE_COMMAND}.status`;

export default class StatusItem {
  item: vscode.StatusBarItem;
  disposable: vscode.Disposable;
  unreadCount: number = 0;
  isVisible: Boolean = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );

    // We construct a new command to send args with base command
    // From: https://github.com/Microsoft/vscode/issues/22353#issuecomment-325293438
    this.disposable = vscode.commands.registerCommand(COMPOUND_COMMAND, () =>
      vscode.commands.executeCommand(BASE_COMMAND, {
        source: EventSource.status
      })
    );

    this.item.command = COMPOUND_COMMAND;
  }

  updateCount(unreads: number) {
    this.unreadCount = unreads;
    this.item.text = `${OCTICON} ${unreads} new`;
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
    this.disposable.dispose();
  }
}
