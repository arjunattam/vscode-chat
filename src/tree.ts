import * as vscode from "vscode";
import * as path from "path";
import * as str from "./strings";
import { SelfCommands } from "./constants";
import {
  Channel,
  User,
  EventSource,
  ChannelLabel,
  Users,
  CurrentUser
} from "./interfaces";

interface ChatTreeItem {
  isOnline: boolean;
  value: string;
  label: string;
  channel: Channel;
  user: User;
}

const GREEN_DOT = path.join(
  __filename,
  "..",
  "..",
  "public",
  "icons",
  "green.svg"
);

class CustomTreeItem extends vscode.TreeItem {
  constructor(label: string, isOnline: boolean, channel: Channel, user: User) {
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

class BaseTreeProvider
  implements vscode.TreeDataProvider<ChatTreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChatTreeItem>();
  readonly onDidChangeTreeData? = this._onDidChangeTreeData.event;
  protected sortingFn = (a, b) => a.label.localeCompare(b.label);
  protected filterFn = undefined;

  protected _disposables: vscode.Disposable[] = [];
  protected isAuthenticated: boolean;
  protected channelLabels: ChannelLabel[];

  dispose() {
    this._disposables.forEach(dispose => dispose.dispose());
  }

  refresh(): void {
    // We can also refresh specific items, but since the ordering
    // might change we refresh the entire tree.
    this._onDidChangeTreeData.fire();
  }

  showData(isAuthenticated, channelLabels) {
    this.isAuthenticated = isAuthenticated;
    this.channelLabels = channelLabels;
    this.refresh();
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
    if (this.isAuthenticated) {
      return this.getChildrenForType();
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

  getChildrenForType(): vscode.ProviderResult<ChatTreeItem[]> {
    const channels = this.channelLabels.sort(this.sortingFn);
    const filtered = channels.filter(this.filterFn).map(channel => ({
      value: channel.channel.id,
      label: channel.label,
      isOnline: channel.isOnline,
      channel: channel.channel,
      user: null
    }));
    return Promise.resolve(filtered);
  }
}

export class UnreadsTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.unread > 0;
  // TODO: should we filter out channels that should be muted?
  protected sortingFn = (a, b) => b.unread - a.unread;
  protected treeLabel = "unreads-tree-view";

  constructor() {
    super();
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.treeLabel, this)
    );
  }
}

export class ChannelTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.channel.type === "channel";
  protected treeLabel = "channels-tree-view";

  constructor() {
    super();
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.treeLabel, this)
    );
  }
}

export class GroupTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.channel.type === "group";
  protected treeLabel = "groups-tree-view";

  constructor() {
    super();
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.treeLabel, this)
    );
  }
}

export class IMsTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.channel.type === "im";
  protected treeLabel = "ims-tree-view";

  constructor() {
    super();
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.treeLabel, this)
    );
  }
}

export class OnlineUsersTreeProvider extends BaseTreeProvider {
  protected treeLabel = "online-users-tree-view";
  private currentUser: CurrentUser;
  private users: Users;
  private imChannels: any;

  constructor() {
    super();
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.treeLabel, this)
    );
  }

  updateData(
    isAuthenticated,
    currentUser: CurrentUser,
    users: Users,
    imChannels
  ) {
    this.isAuthenticated = isAuthenticated;
    this.currentUser = currentUser;
    this.users = users;
    this.imChannels = imChannels;
    this.refresh();
  }

  getChildrenForType(): vscode.ProviderResult<ChatTreeItem[]> {
    const { id: currentId } = this.currentUser;
    const users: User[] = Object.keys(this.users)
      .map(userId => this.users[userId])
      .filter(user => user.isOnline && user.id !== currentId);

    return Promise.resolve(
      users.map(user => ({
        value: user.name,
        label: user.name,
        isOnline: user.isOnline,
        user,
        channel: this.imChannels[user.id]
      }))
    );
  }
}
