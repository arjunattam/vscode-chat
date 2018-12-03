import * as vscode from "vscode";
import { SelfCommands } from "../constants";

const CHAT_OCTICON = "$(comment-discussion)";

export abstract class BaseStatusItem {
  protected item: vscode.StatusBarItem;
  protected disposableCommand: vscode.Disposable;
  protected unreadCount: number = 0;
  protected isVisible: boolean = false;

  constructor(baseCommand: string) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );

    // We construct a new command to send args with base command
    // From: https://github.com/Microsoft/vscode/issues/22353#issuecomment-325293438
    const compound = `${baseCommand}.status`;
    this.disposableCommand = vscode.commands.registerCommand(compound, () => {
      return vscode.commands.executeCommand(baseCommand, {
        source: EventSource.status
      });
    });

    this.item.command = compound;
  }

  abstract updateCount(unreads: number): void;

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
  teamName: string;
  providerName: string;

  constructor(providerName: string, teamName: string, hasChannels: boolean) {
    // Status bar item for vsls chat does not have any channels,
    // hence we will not trigger the the change_channel command
    const baseCommand = hasChannels
      ? SelfCommands.CHANGE_CHANNEL
      : SelfCommands.OPEN_WEBVIEW;
    super(baseCommand);
    this.providerName = providerName;
    this.teamName = teamName;
  }

  updateCount(unreads: number) {
    this.unreadCount = unreads;
    this.item.text = `${CHAT_OCTICON} ${this.teamName}: ${unreads} new`;
    return this.unreadCount > 0 ? this.show() : this.hide();
  }
}
