import * as vsls from "vsls/vscode.js";
import * as vscode from "vscode";
import { SelfCommands } from "../constants";
import { VSLS_CHAT_CHANNEL } from "../vslsChat/utils";

const LIVE_SHARE_VIEW_ID = "liveshare.session";
const LIVE_SHARE_EXPLORER_VIEW_ID = "liveshare.session.explorer";
const TREE_ITEM_LABEL = "Chat Channel";

export class VslsSessionTreeProvider
  implements vscode.TreeDataProvider<any>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<any>();
  readonly onDidChangeTreeData? = this._onDidChangeTreeData.event;
  private _disposables: vscode.Disposable[] = [];
  private unreadCount: number = 0;

  commandName: string;
  disposableCommand: vscode.Disposable;

  constructor() {
    const baseCommand = SelfCommands.OPEN_WEBVIEW;
    this.commandName = `${baseCommand}.activityBar`;

    // Construct a compound command around base command to send
    // the correct event source value for telemetry
    const chatArgs: ChatArgs = {
      source: EventSource.activity,
      providerName: "vsls",
      channelId: VSLS_CHAT_CHANNEL.id
    };
    this.disposableCommand = vscode.commands.registerCommand(
      this.commandName,
      () => vscode.commands.executeCommand(baseCommand, chatArgs)
    );
    this._disposables.push(this.disposableCommand);
  }

  updateUnreadCount(count: number) {
    this.unreadCount = count;
    this.refresh();
  }

  async refresh(treeItem?: any) {
    return treeItem
      ? this._onDidChangeTreeData.fire(treeItem)
      : this._onDidChangeTreeData.fire();
  }

  async register() {
    const liveshare: any = await vsls.getApi();

    if (!!liveshare) {
      this._disposables.push(
        liveshare.registerTreeDataProvider(LIVE_SHARE_VIEW_ID, this)
      );
      this._disposables.push(
        liveshare.registerTreeDataProvider(LIVE_SHARE_EXPLORER_VIEW_ID, this)
      );
    }
  }

  getTreeItem(element: any): vscode.TreeItem | Thenable<vscode.TreeItem> {
    let label = element.label;

    if (this.unreadCount > 0) {
      label = `${label} (${this.unreadCount} new)`;
    }

    const treeItem = new vscode.TreeItem(label);
    treeItem.command = {
      command: this.commandName,
      title: TREE_ITEM_LABEL,
      arguments: []
    };
    return treeItem;
  }

  getChildren(element?: any): vscode.ProviderResult<any[]> {
    return Promise.resolve([{ label: TREE_ITEM_LABEL }]);
  }

  dispose() {
    this._disposables.forEach(dispose => dispose.dispose());
  }
}
