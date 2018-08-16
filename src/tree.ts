import * as vscode from "vscode";
import * as path from "path";
import Store from "./store";
import { SelfCommands } from "./constants";
import { SlackChannel } from "./interfaces";

interface ChatTreeItem {
  isOnline: boolean;
  value: string;
  label: string;
}

const GREEN_DOT = path.join(
  __filename,
  "..",
  "..",
  "public",
  "icons",
  "green.svg"
);

export default class ChatTreeProviders {
  constructor(private store: Store) {}

  register() {
    const unreadsTreeProvider = new UnreadsTreeProvider(this.store);
    this.store.setTreeCallback(() => unreadsTreeProvider.refresh());
    vscode.window.registerTreeDataProvider(
      "unreads-tree-view",
      unreadsTreeProvider
    );

    const channelsTreeProvider = new ChannelTreeProvider(this.store);
    this.store.setTreeCallback(() => channelsTreeProvider.refresh());
    vscode.window.registerTreeDataProvider(
      "channels-tree-view",
      channelsTreeProvider
    );

    const groupsTreeProvider = new GroupTreeProvider(this.store);
    this.store.setTreeCallback(() => groupsTreeProvider.refresh());
    vscode.window.registerTreeDataProvider(
      "groups-tree-view",
      groupsTreeProvider
    );

    const imsTreeProvider = new IMsTreeProvider(this.store);
    this.store.setTreeCallback(() => imsTreeProvider.refresh());
    vscode.window.registerTreeDataProvider("ims-tree-view", imsTreeProvider);

    const usersTreeProvider = new OnlineUsersTreeProvider(this.store);
    this.store.setTreeCallback(() => usersTreeProvider.refresh());
    vscode.window.registerTreeDataProvider(
      "online-users-tree-view",
      usersTreeProvider
    );
  }
}

class CustomTreeItem extends vscode.TreeItem {
  constructor(label: string, isOnline: boolean, channel: SlackChannel) {
    super(label);

    this.contextValue = "channel";

    if (isOnline) {
      this.iconPath = {
        light: GREEN_DOT,
        dark: GREEN_DOT
      };
    }

    if (channel) {
      this.command = {
        command: SelfCommands.OPEN,
        title: `Open ${channel.name}`,
        arguments: [{ channel }]
      };
    }
  }
}

class BaseTreeProvider implements vscode.TreeDataProvider<ChatTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChatTreeItem>();
  readonly onDidChangeTreeData? = this._onDidChangeTreeData.event;

  constructor(protected store: Store) {}

  refresh(): void {
    // We can also refresh specific items, but since the ordering
    // might change we refresh the entire tree.
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ChatTreeItem): vscode.TreeItem {
    const { value, label, isOnline } = element;
    const channel = this.store.channels.find(c => c.id === value);
    const treeItem = new CustomTreeItem(label, isOnline, channel);
    return treeItem;
  }

  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    throw new Error("Method not implemented");
  }

  getParent?(element: ChatTreeItem): vscode.ProviderResult<ChatTreeItem> {
    throw new Error("Method not implemented");
  }

  getChildrenForType(filterFn): vscode.ProviderResult<ChatTreeItem[]> {
    return new Promise(resolve => {
      const channels = this.store.getChannelLabels();
      resolve(
        channels.filter(filterFn).map(c => ({
          value: c.id,
          label: c.label,
          isOnline: c.isOnline
        }))
      );
    });
  }
}

class UnreadsTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return this.getChildrenForType(c => c.unread > 0);
  }
}

class ChannelTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return this.getChildrenForType(c => c.type === "channel");
  }
}

class GroupTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return this.getChildrenForType(c => c.type === "group");
  }
}

class IMsTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return this.getChildrenForType(c => c.type === "im");
  }
}

class OnlineUsersTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return new Promise(resolve => {
      const users = Object.keys(this.store.users)
        .map(userId => this.store.users[userId])
        .filter(user => user.isOnline);
      resolve(
        users.map(c => ({
          value: c.name,
          label: c.name,
          isOnline: c.isOnline
        }))
      );
    });
  }
}
