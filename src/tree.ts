import * as vscode from "vscode";
import * as path from "path";
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
} from "./types";

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

class CustomChatTreeItem extends vscode.TreeItem {
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
        command: SelfCommands.OPEN_WEBVIEW,
        title: "",
        arguments: [{ channel, user, source: EventSource.activity }]
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
  protected viewId: string;
  protected sortingFn = (a, b) => a.label.localeCompare(b.label);
  protected filterFn = undefined;

  protected _disposables: vscode.Disposable[] = [];
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

  update(channelLabels: ChannelLabel[]) {
    const filtered = channelLabels.filter(this.filterFn).sort(this.sortingFn);
    const prevLabels = this.getLabelsObject(this.channelLabels);
    const newLabels = this.getLabelsObject(filtered);
    this.channelLabels = filtered;

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
    if (!element) {
      return this.getRootChildren();
    }

    if (!!element && element.isCategory) {
      return this.getChildrenForCategory(element);
    }
  }

  getChildrenForCategory(
    element: ChatTreeNode
  ): vscode.ProviderResult<ChatTreeNode[]> {
    const { label: category } = element;
    const channels = this.channelLabels
      .filter(channelLabel => {
        const { channel } = channelLabel;
        return channel.categoryName === category;
      })
      .map(this.getItemForChannel);
    return Promise.resolve(channels);
  }

  getRootChildren(): vscode.ProviderResult<ChatTreeNode[]> {
    const channelsWithoutCategories = this.channelLabels
      .filter(channelLabel => !channelLabel.channel.categoryName)
      .map(this.getItemForChannel);
    const categories = this.channelLabels
      .map(channelLabel => channelLabel.channel.categoryName)
      .filter(name => !!name);
    const uniqueCategories = categories
      .filter((item, pos) => categories.indexOf(item) === pos)
      .map(this.getItemForCategory);
    return Promise.resolve([...channelsWithoutCategories, ...uniqueCategories]);
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
    const treeItem = new CustomChatTreeItem(
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
    this.viewId = `chat.treeView.unreads.${provider}`;
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.viewId, this)
    );
  }
}

export class ChannelTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.channel.type === ChannelType.channel;

  constructor(provider: string) {
    super();
    this.viewId = `chat.treeView.channels.${provider}`;
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.viewId, this)
    );
  }
}

export class GroupTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.channel.type === ChannelType.group;

  constructor(provider: string) {
    super();
    this.viewId = `chat.treeView.groups.${provider}`;
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.viewId, this)
    );
  }
}

export class IMsTreeProvider extends BaseTreeProvider {
  protected filterFn = c => c.channel.type === ChannelType.im;

  constructor(provider: string) {
    super();
    this.viewId = `chat.treeView.ims.${provider}`;
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.viewId, this)
    );
  }
}

export class OnlineUsersTreeProvider extends BaseTreeProvider {
  private users: User[] = [];
  private imChannels: { [userId: string]: Channel } = {};
  private DM_ROLE_NAME = "Direct Messages";
  private OTHERS_ROLE_NAME = "Others";

  constructor(private providerName: string) {
    super();
    this.viewId = `chat.treeView.onlineUsers.${providerName}`;
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.viewId, this)
    );
  }

  updateData(currentUser: CurrentUser, users: Users, imChannels) {
    const { id: currentId } = currentUser;

    const prevUserIds = new Set(this.users.map(user => user.id));
    this.users = Object.keys(users)
      .map(userId => users[userId])
      .filter(user => user.isOnline && user.id !== currentId);
    const newUserIds = new Set(this.users.map(user => user.id));
    this.imChannels = imChannels;

    if (!equals(prevUserIds, newUserIds)) {
      return this.refresh();
    }
  }

  getItemForUser(user: User): ChatTreeNode {
    return {
      label: user.name,
      isOnline: user.isOnline,
      isCategory: false,
      user,
      channel: this.imChannels[user.id]
    };
  }

  getChildrenForCategory(element: ChatTreeNode) {
    const { label: role } = element;

    if (role === this.DM_ROLE_NAME) {
      const dmUserIds = Object.keys(this.imChannels);
      return Promise.resolve(
        this.users
          .filter(user => dmUserIds.indexOf(user.id) >= 0)
          .map(user => this.getItemForUser(user))
      );
    }

    if (role === this.OTHERS_ROLE_NAME) {
      const usersWithoutRoles = this.users.filter(user => !user.roleName);
      return Promise.resolve(
        usersWithoutRoles.map(user => this.getItemForUser(user))
      );
    }

    const users = this.users
      .filter(user => user.roleName === role)
      .map(user => this.getItemForUser(user));
    return Promise.resolve(users);
  }

  getRootChildren(): vscode.ProviderResult<ChatTreeNode[]> {
    if (this.providerName === "slack") {
      return Promise.resolve(this.users.map(user => this.getItemForUser(user)));
    }

    // Since Discord guilds can have lots of members, we want to ensure all
    // members are categorised for easy navigation.
    // For this, we introduced 2 roles: "Direct Messages" and "Others"
    // const dmRoles = this.
    let rootElements = [];
    const dmUserIds = Object.keys(this.imChannels);

    if (dmUserIds.length > 0) {
      rootElements.push(this.getItemForCategory(this.DM_ROLE_NAME));
    }

    const roles = this.users
      .filter(user => !!user.roleName)
      .map(user => user.roleName);
    const uniqueRoles = roles
      .filter((item, pos) => roles.indexOf(item) === pos)
      .map(this.getItemForCategory);

    if (uniqueRoles.length > 0) {
      rootElements = [...rootElements, ...uniqueRoles];
    }

    const usersWithoutRoles = this.users.filter(user => !user.roleName);

    if (usersWithoutRoles.length > 0) {
      rootElements.push(this.getItemForCategory(this.OTHERS_ROLE_NAME));
    }

    return Promise.resolve(rootElements);
  }

  getParent(element: ChatTreeNode): vscode.ProviderResult<ChatTreeNode> {
    return;
  }
}
