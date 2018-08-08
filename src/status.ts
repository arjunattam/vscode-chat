import * as vscode from "vscode";
import { SelfCommands } from "./constants";

const OCTICON = "$(comment-discussion)";

export default class StatusItem {
  item: vscode.StatusBarItem;
  unreadCount: number = 0;
  isVisible: Boolean = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );
    this.item.command = SelfCommands.OPEN;
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
  }
}
