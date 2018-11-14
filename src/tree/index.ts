import * as vscode from "vscode";
import * as path from "path";
import { SelfCommands } from "../constants";
import { equals } from "../utils";
import {
  Channel,
  User,
  EventSource,
  ChannelLabel,
  Users,
  CurrentUser,
  ChannelType,
  UserPresence
} from "../types";

interface ChatTreeNode {
  label: string;
  channel: Channel | undefined;
  user: User | undefined;
  isCategory: boolean;
  presence: UserPresence;
}

interface ISortingFunction {
  (a: ChannelLabel, b: ChannelLabel): number;
}

interface IFilterFunction {
  (a: ChannelLabel): boolean;
}

// User-defined type guard
// https://github.com/Microsoft/TypeScript/issues/20707#issuecomment-351874491
function notUndefined<T>(x: T | undefined): x is T {
  return x !== undefined;
}

const BASE_PATH = path.join(
  __filename,
  "..",
  "..",
  "public",
  "icons",
  "presence"
);

const PRESENCE_ICONS = {
  green: path.join(BASE_PATH, "green.svg"),
  red: path.join(BASE_PATH, "red.svg"),
  yellow: path.join(BASE_PATH, "yellow.svg")
};

class CustomChatTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    presence: UserPresence,
    isCategory: boolean,
    channel?: Channel,
    user?: User
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

    switch (presence) {
      case UserPresence.available:
        this.iconPath = {
          light: PRESENCE_ICONS.green,
          dark: PRESENCE_ICONS.green
        };
        break;
      case UserPresence.doNotDisturb:
        this.iconPath = {
          light: PRESENCE_ICONS.red,
          dark: PRESENCE_ICONS.red
        };
        break;
      case UserPresence.idle:
        this.iconPath = {
          light: PRESENCE_ICONS.yellow,
          dark: PRESENCE_ICONS.yellow
        };
        break;
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

  protected sortingFn: ISortingFunction = (a: ChannelLabel, b: ChannelLabel) =>
    a.label.localeCompare(b.label);
  protected filterFn: IFilterFunction = () => true;

  protected _disposables: vscode.Disposable[] = [];
  protected channelLabels: ChannelLabel[] = [];

  constructor(protected viewId: string) {
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.viewId, this)
    );
  }

  dispose() {
    this._disposables.forEach(dispose => dispose.dispose());
  }

  getLabelsObject(
    channeLabels: ChannelLabel[]
  ): { [channelId: string]: ChannelLabel } {
    let result: { [channelId: string]: ChannelLabel } = {};
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

    // Looking for changes in presence and unread
    Object.keys(newLabels).forEach(channelId => {
      const newLabel = newLabels[channelId];
      const prevLabel = prevLabels[channelId];

      if (prevLabel.unread !== newLabel.unread) {
        // Can we send just this element?
        this.refresh();
      }

      if (prevLabel.presence !== newLabel.presence) {
        // Can we send just this element?
        this.refresh();
      }
    });
  }

  getParent(element: ChatTreeNode): vscode.ProviderResult<ChatTreeNode> {
    const { channel } = element;

    if (!!channel && !!channel.categoryName) {
      return Promise.resolve(this.getItemForCategory(channel.categoryName));
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
    const categories: string[] = this.channelLabels
      .map(channelLabel => channelLabel.channel.categoryName)
      .filter(notUndefined);
    const uniqueCategories = categories
      .filter((item, pos) => categories.indexOf(item) === pos)
      .map(category => this.getItemForCategory(category));
    return Promise.resolve([...channelsWithoutCategories, ...uniqueCategories]);
  }

  getItemForChannel(channelLabel: ChannelLabel): ChatTreeNode {
    const { label, presence, channel } = channelLabel;
    return {
      label,
      presence,
      channel,
      isCategory: false,
      user: undefined
    };
  }

  getItemForCategory(category: string): ChatTreeNode {
    return {
      label: category,
      presence: UserPresence.unknown,
      isCategory: true,
      channel: undefined,
      user: undefined
    };
  }

  getTreeItem(element: ChatTreeNode): vscode.TreeItem {
    // TODO: when selected, the highlight on the tree item seems to stick. This might
    // be because we don't use URIs (~= each channel is a URI) to open/close. Need to investigate.
    const { label, presence, isCategory, channel, user } = element;
    const treeItem = new CustomChatTreeItem(
      label,
      presence,
      isCategory,
      channel,
      user
    );
    return treeItem;
  }
}

export class UnreadsTreeProvider extends BaseTreeProvider {
  protected filterFn: IFilterFunction = c => c.unread > 0;
  protected sortingFn: ISortingFunction = (a, b) => b.unread - a.unread;

  constructor(provider: string) {
    super(`chat.treeView.unreads.${provider}`);
  }
}

export class ChannelTreeProvider extends BaseTreeProvider {
  protected filterFn: IFilterFunction = c =>
    c.channel.type === ChannelType.channel;

  constructor(provider: string) {
    super(`chat.treeView.channels.${provider}`);
  }
}

export class GroupTreeProvider extends BaseTreeProvider {
  protected filterFn: IFilterFunction = c =>
    c.channel.type === ChannelType.group;

  constructor(provider: string) {
    super(`chat.treeView.groups.${provider}`);
  }
}

export class IMsTreeProvider extends BaseTreeProvider {
  protected filterFn: IFilterFunction = c => c.channel.type === ChannelType.im;

  constructor(provider: string) {
    super(`chat.treeView.ims.${provider}`);
  }
}

export class OnlineUsersTreeProvider extends BaseTreeProvider {
  private users: User[] = [];
  private imChannels: { [userId: string]: Channel } = {};
  private DM_ROLE_NAME = "Direct Messages";
  private OTHERS_ROLE_NAME = "Others";

  constructor(private providerName: string) {
    super(`chat.treeView.onlineUsers.${providerName}`);
  }

  updateData(
    currentUser: CurrentUser,
    users: Users,
    imChannels: { [userId: string]: Channel }
  ) {
    const { id: currentId } = currentUser;
    const ALLOWED_PRESENCE = [
      UserPresence.available,
      UserPresence.doNotDisturb,
      UserPresence.idle
    ];

    const prevUserIds = new Set(this.users.map(user => user.id));
    this.users = Object.keys(users)
      .map(userId => users[userId])
      .filter(user => ALLOWED_PRESENCE.indexOf(user.presence) >= 0)
      .filter(user => user.id !== currentId); // Can't have the self user in this list
    const newUserIds = new Set(this.users.map(user => user.id));
    this.imChannels = imChannels;

    if (!equals(prevUserIds, newUserIds)) {
      return this.refresh();
    }
  }

  getItemForUser(user: User): ChatTreeNode {
    return {
      label: user.name,
      presence: user.presence,
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
      .filter(notUndefined)
      .map(role => this.getItemForCategory(role));

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
