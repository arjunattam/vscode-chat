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
  CurrentUser,
  ChannelType
} from "./interfaces";

interface ChatTreeItem {
  label: string;
  channel: Channel;
  user: User;
  isCategory: boolean;
  isOnline: boolean;
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
  constructor(
    label: string,
    isOnline: boolean,
    isCategory: boolean,
    channel: Channel,
    user: User
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
    } else if (label === str.SIGN_IN_SLACK) {
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

    if (isCategory) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
  }
}

class BaseTreeProvider
  implements vscode.TreeDataProvider<ChatTreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChatTreeItem>();
  readonly onDidChangeTreeData? = this._onDidChangeTreeData.event;
  protected treeLabel: string;
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
    const { label, isOnline, isCategory, channel, user } = element;
    const treeItem = new CustomTreeItem(
      label,
      isOnline,
      isCategory,
      channel,
      user
    );
    return treeItem;
  }

  getParent(element: ChatTreeItem): vscode.ProviderResult<ChatTreeItem> {
    if (!!element.channel.categoryName) {
      return Promise.resolve(
        this.getItemForCategory(element.channel.categoryName)
      );
    }
  }

  getChildren(element?: ChatTreeItem): vscode.ProviderResult<ChatTreeItem[]> {
    if (this.isAuthenticated) {
      if (!!element && element.isCategory) {
        const channels = this.channelLabels
          .filter(this.filterFn)
          .sort(this.sortingFn)
          .filter(channelLabel => {
            const { channel } = channelLabel;
            return channel.categoryName === element.label;
          });
        return Promise.resolve(channels.map(this.getItemForChannel));
      } else {
        return this.getRootChildren();
      }
    } else {
      return Promise.resolve([
        {
          label: str.SIGN_IN_SLACK,
          isCategory: false,
          isOnline: false,
          channel: null,
          user: null
        }
      ]);
    }
  }

  getItemForChannel(channelLabel: ChannelLabel): ChatTreeItem {
    const { label, isOnline, channel } = channelLabel;
    return {
      label,
      isOnline,
      channel,
      isCategory: false,
      user: null
    };
  }

  getItemForCategory(category: string): ChatTreeItem {
    return {
      label: category,
      isOnline: false,
      isCategory: true,
      channel: null,
      user: null
    };
  }

  getRootChildren(): vscode.ProviderResult<ChatTreeItem[]> {
    // Returns all categories, and channels that don't have a category
    const filtered = this.channelLabels
      .filter(this.filterFn)
      .sort(this.sortingFn);

    const withoutCategories = filtered.filter(
      channelLabel => !channelLabel.channel.categoryName
    );

    const categories = filtered
      .map(channelLabel => channelLabel.channel.categoryName)
      .filter(name => !!name);
    const sansDuplicates = categories
      .filter((item, pos) => categories.indexOf(item) == pos)
      .map(this.getItemForCategory);

    const channelItems = withoutCategories.map(this.getItemForChannel);
    return Promise.resolve([...channelItems, ...sansDuplicates]);
  }
}

export class UnreadsTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.unread > 0;
  protected sortingFn = (a, b) => b.unread - a.unread;

  constructor(provider: string) {
    super();
    this.treeLabel = `chat.treeView.unreads.${provider}`;
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.treeLabel, this)
    );
  }
}

export class ChannelTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.channel.type === ChannelType.channel;

  constructor(provider: string) {
    super();
    this.treeLabel = `chat.treeView.channels.${provider}`;
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.treeLabel, this)
    );
  }
}

export class GroupTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.channel.type === ChannelType.group;

  constructor(provider: string) {
    super();
    this.treeLabel = `chat.treeView.groups.${provider}`;
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.treeLabel, this)
    );
  }
}

export class IMsTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.channel.type === ChannelType.im;

  constructor(provider: string) {
    super();
    this.treeLabel = `chat.treeView.ims.${provider}`;
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.treeLabel, this)
    );
  }
}

export class OnlineUsersTreeProvider extends BaseTreeProvider {
  private currentUser: CurrentUser;
  private users: Users;
  private imChannels: any;

  constructor(providerName: string) {
    super();
    this.treeLabel = `chat.treeView.onlineUsers.${providerName}`;
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

  getRootChildren(): vscode.ProviderResult<ChatTreeItem[]> {
    const { id: currentId } = this.currentUser;
    const users: User[] = Object.keys(this.users)
      .map(userId => this.users[userId])
      .filter(user => user.isOnline && user.id !== currentId);

    return Promise.resolve(
      users.map(user => ({
        label: user.name,
        isOnline: user.isOnline,
        isCategory: false,
        user,
        channel: this.imChannels[user.id]
      }))
    );
  }
}
