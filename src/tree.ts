import * as vscode from "vscode";
import * as path from "path";
import * as str from "./strings";
import { SelfCommands } from "./constants";
import { equals } from "./utils";
import {
  Channel,
  User,
  EventSource,
  ChannelLabel,
  Users,
  CurrentUser,
  ChannelType
} from "./interfaces";

interface ChatTreeNode {
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
  implements vscode.TreeDataProvider<ChatTreeNode>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChatTreeNode>();
  readonly onDidChangeTreeData? = this._onDidChangeTreeData.event;
  protected treeLabel: string;
  protected sortingFn = (a, b) => a.label.localeCompare(b.label);
  protected filterFn = undefined;

  protected _disposables: vscode.Disposable[] = [];
  protected isAuthenticated: boolean;
  protected channelLabels: ChannelLabel[] = [];

  dispose() {
    this._disposables.forEach(dispose => dispose.dispose());
  }

  getLabelsObject(
    channeLabels: ChannelLabel[]
  ): { [channelId: string]: ChannelLabel } {
    let result = {};
    channeLabels.forEach(label => {
      const { channel } = label;
      result[channel.id] = label;
    });
    return result;
  }

  async refresh(treeItem?: ChatTreeNode) {
    return treeItem
      ? this._onDidChangeTreeData.fire(treeItem)
      : this._onDidChangeTreeData.fire();
  }

  update(isAuthenticated: boolean, channelLabels: ChannelLabel[]) {
    const prevAuthenticated = this.isAuthenticated;
    this.isAuthenticated = isAuthenticated;

    const filtered = channelLabels.filter(this.filterFn).sort(this.sortingFn);
    const prevLabels = this.getLabelsObject(this.channelLabels);
    const newLabels = this.getLabelsObject(filtered);
    this.channelLabels = filtered;

    if (prevAuthenticated !== isAuthenticated) {
      // Changing auth means refreshing everything
      return this.refresh();
    }

    if (
      !equals(new Set(Object.keys(prevLabels)), new Set(Object.keys(newLabels)))
    ) {
      // We have new channels, so we are replacing everything
      // Can potentially optimize this
      return this.refresh();
    }

    // Looking for changes in isOnline and unread
    Object.keys(newLabels).forEach(channelId => {
      const newLabel = newLabels[channelId];
      const prevLabel = prevLabels[channelId];

      if (prevLabel.unread !== newLabel.unread) {
        // Can we send just this element?
        this.refresh();
      }

      if (prevLabel.isOnline !== newLabel.isOnline) {
        // Can we send just this element?
        this.refresh();
      }
    });
  }

  getParent(element: ChatTreeNode): vscode.ProviderResult<ChatTreeNode> {
    if (!!element.channel.categoryName) {
      return Promise.resolve(
        this.getItemForCategory(element.channel.categoryName)
      );
    }
  }

  getChildren(element?: ChatTreeNode): vscode.ProviderResult<ChatTreeNode[]> {
    if (!this.isAuthenticated) {
      return this.getNoAuthChildren();
    }

    if (!element) {
      return this.getRootChildren();
    }

    if (!!element && element.isCategory) {
      const channels = this.channelLabels.filter(channelLabel => {
        const { channel } = channelLabel;
        return channel.categoryName === element.label;
      });
      return Promise.resolve(channels.map(this.getItemForChannel));
    }
  }

  getRootChildren(): vscode.ProviderResult<ChatTreeNode[]> {
    // Returns all categories, and channels that don't have a category
    const withoutCategories = this.channelLabels.filter(
      channelLabel => !channelLabel.channel.categoryName
    );

    const categories = this.channelLabels
      .map(channelLabel => channelLabel.channel.categoryName)
      .filter(name => !!name);
    const sansDuplicates = categories
      .filter((item, pos) => categories.indexOf(item) == pos)
      .map(this.getItemForCategory);

    const channelItems = withoutCategories.map(this.getItemForChannel);
    return Promise.resolve([...channelItems, ...sansDuplicates]);
  }

  getNoAuthChildren(): vscode.ProviderResult<ChatTreeNode[]> {
    // TODO: set this up for both slack and discord
    // TODO: can we avoid this when we are changing workspaces in discord?
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

  getItemForChannel(channelLabel: ChannelLabel): ChatTreeNode {
    const { label, isOnline, channel } = channelLabel;
    return {
      label,
      isOnline,
      channel,
      isCategory: false,
      user: null
    };
  }

  getItemForCategory(category: string): ChatTreeNode {
    return {
      label: category,
      isOnline: false,
      isCategory: true,
      channel: null,
      user: null
    };
  }

  getTreeItem(element: ChatTreeNode): vscode.TreeItem {
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
  private users: User[] = [];
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
    const prevAuthenticated = this.isAuthenticated;
    this.isAuthenticated = isAuthenticated;
    const { id: currentId } = currentUser;

    const prevUserIds = new Set(this.users.map(user => user.id));
    this.users = Object.keys(users)
      .map(userId => users[userId])
      .filter(user => user.isOnline && user.id !== currentId);
    const newUserIds = new Set(this.users.map(user => user.id));

    // TODO: In discord, we might have imChannels that do not have
    // corresponding user. Should we show them? (Need to get online status)
    // It would also be useful to categorise DM and guild users separately
    this.imChannels = imChannels;

    if (prevAuthenticated !== isAuthenticated) {
      return this.refresh();
    }

    if (!equals(prevUserIds, newUserIds)) {
      return this.refresh();
    }
  }

  getRootChildren(): vscode.ProviderResult<ChatTreeNode[]> {
    return Promise.resolve(
      this.users.map(user => ({
        label: user.name,
        isOnline: user.isOnline,
        isCategory: false,
        user,
        channel: this.imChannels[user.id]
      }))
    );
  }
}
