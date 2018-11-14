import * as vsls from "vsls/vscode";
import * as vscode from "vscode";
import { SelfCommands } from "../constants";
import { EventSource } from "../types";

const LIVE_SHARE_VIEW_ID = "liveshare.session";
const TREE_ITEM_LABEL = "Chat Thread";

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
    this.disposableCommand = vscode.commands.registerCommand(
      this.commandName,
      () => {
        return vscode.commands.executeCommand(baseCommand, {
          source: EventSource.activity
        });
      }
    );
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
      const disposable = liveshare.registerTreeDataProvider(
        LIVE_SHARE_VIEW_ID,
        this
      );
      this._disposables.push(disposable);
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
