import * as vscode from "vscode";
import * as path from "path";
import Store from "./store";
import { SelfCommands } from "./constants";
import { SlackChannel, SlackUser } from "./interfaces";

interface ChatTreeItem {
  isOnline: boolean;
  value: string;
  label: string;
  channel: SlackChannel;
  user: SlackUser;
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

  register(): vscode.Disposable[] {
    const unreadsTreeProvider = new UnreadsTreeProvider(this.store);
    this.store.setTreeCallback(() => unreadsTreeProvider.refresh());

    const channelsTreeProvider = new ChannelTreeProvider(this.store);
    this.store.setTreeCallback(() => channelsTreeProvider.refresh());

    const groupsTreeProvider = new GroupTreeProvider(this.store);
    this.store.setTreeCallback(() => groupsTreeProvider.refresh());

    const imsTreeProvider = new IMsTreeProvider(this.store);
    this.store.setTreeCallback(() => imsTreeProvider.refresh());

    const usersTreeProvider = new OnlineUsersTreeProvider(this.store);
    this.store.setTreeCallback(() => usersTreeProvider.refresh());

    const registrar = vscode.window.registerTreeDataProvider;
    return [
      registrar("unreads-tree-view", unreadsTreeProvider),
      registrar("channels-tree-view", channelsTreeProvider),
      registrar("groups-tree-view", groupsTreeProvider),
      registrar("ims-tree-view", imsTreeProvider),
      registrar("online-users-tree-view", usersTreeProvider)
    ];
  }
}

class CustomTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    isOnline: boolean,
    channel: SlackChannel,
    user: SlackUser
  ) {
    super(label);

    this.contextValue = "channel";

    if (isOnline) {
      this.iconPath = {
        light: GREEN_DOT,
        dark: GREEN_DOT
      };
    }

    this.command = {
      command: SelfCommands.OPEN,
      title: "",
      arguments: [{ channel, user }]
    };
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
    const { label, isOnline, channel, user } = element;
    const treeItem = new CustomTreeItem(label, isOnline, channel, user);
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
        channels.filter(filterFn).map(channel => ({
          value: channel.id,
          label: channel.label,
          isOnline: channel.isOnline,
          channel,
          user: null
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
      const users: SlackUser[] = Object.keys(this.store.users)
        .map(userId => this.store.users[userId])
        .filter(user => user.isOnline);

      resolve(
        users.map(user => ({
          value: user.name,
          label: user.name,
          isOnline: user.isOnline,
          user,
          channel: this.store.getIMChannel(user)
        }))
      );
    });
  }
}
