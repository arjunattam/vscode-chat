import * as vscode from "vscode";
import * as path from "path";
import * as str from "./strings";
import { SelfCommands } from "./constants";
import { SlackChannel, SlackUser, EventSource, IStore } from "./interfaces";

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
  unreads: UnreadsTreeProvider;
  channels: ChannelTreeProvider;
  ims: IMsTreeProvider;
  groups: GroupTreeProvider;
  users: OnlineUsersTreeProvider;

  constructor(private store: IStore) {
    this.unreads = new UnreadsTreeProvider(store);
    this.channels = new ChannelTreeProvider(store);
    this.groups = new GroupTreeProvider(store);
    this.ims = new IMsTreeProvider(store);
    this.users = new OnlineUsersTreeProvider(store);

    this.setupCallbacks();
  }

  setupCallbacks() {
    this.store.setTreeCallback(() => this.unreads.refresh());
    this.store.setTreeCallback(() => this.channels.refresh());
    this.store.setTreeCallback(() => this.groups.refresh());
    this.store.setTreeCallback(() => this.ims.refresh());
    this.store.setTreeCallback(() => this.users.refresh());
  }

  register(): vscode.Disposable[] {
    const registrar = vscode.window.registerTreeDataProvider;
    return [
      registrar("unreads-tree-view", this.unreads),
      registrar("channels-tree-view", this.channels),
      registrar("groups-tree-view", this.groups),
      registrar("ims-tree-view", this.ims),
      registrar("online-users-tree-view", this.users)
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

    if (!!channel) {
      // This is a channel item
      this.contextValue = "channel";
      this.command = {
        command: SelfCommands.OPEN,
        title: "",
        arguments: [{ channel, user, source: EventSource.activity }]
      };
    } else {
      // This is the sign in item
      this.command = {
        command: SelfCommands.SIGN_IN,
        title: "",
        arguments: [{ source: EventSource.activity }]
      };
    }

    if (isOnline) {
      this.iconPath = {
        light: GREEN_DOT,
        dark: GREEN_DOT
      };
    }
  }
}

class BaseTreeProvider implements vscode.TreeDataProvider<ChatTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChatTreeItem>();
  readonly onDidChangeTreeData? = this._onDidChangeTreeData.event;
  protected filterFn = undefined;
  protected sortingFn = undefined;

  constructor(protected store: IStore) {}

  refresh(): void {
    // We can also refresh specific items, but since the ordering
    // might change we refresh the entire tree.
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ChatTreeItem): vscode.TreeItem {
    // TODO: when selected, the highlight on the tree item seems to stick. This might
    // be because we don't use URIs (~= each channel is a URI) to open/close. Need to investigate.
    const { label, isOnline, channel, user } = element;
    const treeItem = new CustomTreeItem(label, isOnline, channel, user);
    return treeItem;
  }

  getParent?(element: ChatTreeItem): vscode.ProviderResult<ChatTreeItem> {
    throw new Error("Method not implemented");
  }

  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    if (this.store.isAuthenticated()) {
      return this.getChildrenForType(this.filterFn, this.sortingFn);
    } else {
      return Promise.resolve([
        {
          value: str.SIGN_IN_SLACK,
          label: str.SIGN_IN_SLACK,
          isOnline: false,
          channel: null,
          user: null
        }
      ]);
    }
  }

  getChildrenForType(
    filterFn,
    sortingFn?
  ): vscode.ProviderResult<ChatTreeItem[]> {
    const channels = this.store.getChannelLabels().sort(sortingFn);
    return Promise.resolve(
      channels.filter(filterFn).map(channel => ({
        value: channel.id,
        label: channel.label,
        isOnline: channel.isOnline,
        channel,
        user: null
      }))
    );
  }
}

class UnreadsTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.unread > 0;
  protected sortingFn = (a, b) => b.unread - a.unread;
}

class ChannelTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.type === "channel";
}

class GroupTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.type === "group";
}

class IMsTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.type === "im";
}

class OnlineUsersTreeProvider extends BaseTreeProvider {
  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    return new Promise(resolve => {
      const { id: currentId } = this.store.currentUserInfo;
      const users: SlackUser[] = Object.keys(this.store.users)
        .map(userId => this.store.users[userId])
        .filter(user => user.isOnline && user.id !== currentId);
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
