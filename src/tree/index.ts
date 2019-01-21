import * as vscode from "vscode";
import {
  BaseChannelsListTreeProvider,
  IFilterFunction,
  ISortingFunction
} from "./base";
import { WorkspaceTreeItem, ChannelTreeItem } from "./treeItem";
import { equals, notUndefined } from "../utils";

export class WorkspacesTreeProvider extends BaseChannelsListTreeProvider {
  protected filterFn: IFilterFunction = c => c.unread > 0;
  protected sortingFn: ISortingFunction = (a, b) => b.unread - a.unread;
  private userInfo: CurrentUser | undefined;

  constructor(provider: string) {
    super(provider, `chat.treeView.workspaces.${provider}`);
  }

  updateCurrentUser(userInfo: CurrentUser) {
    if (!this.userInfo) {
      this.userInfo = userInfo;
      this.refresh();
    } else {
      const existingTeamIds = this.userInfo.teams.map(team => team.id);
      const newTeamIds = userInfo.teams.map(team => team.id);

      if (!equals(new Set(existingTeamIds), new Set(newTeamIds))) {
        this.userInfo = userInfo;
        this.refresh();
      }
    }
  }

  getChildren = (
    element?: ChatTreeNode
  ): vscode.ProviderResult<ChatTreeNode[]> => {
    if (!element) {
      if (!!this.userInfo) {
        const { teams } = this.userInfo;
        return teams.map(this.getItemForTeam);
      }
    }
  };

  getItemForTeam = (team: Team): ChatTreeNode => {
    return {
      label: team.name,
      presence: UserPresence.unknown,
      isCategory: false,
      channel: undefined,
      user: undefined,
      team: team,
      providerName: this.providerName
    };
  };

  getTreeItem = (element: ChatTreeNode): vscode.TreeItem => {
    const { label, team, providerName } = element;
    const treeItem = new WorkspaceTreeItem(label, providerName, team);
    return treeItem;
  };
}

export class UnreadsTreeProvider extends BaseChannelsListTreeProvider {
  protected filterFn: IFilterFunction = c => c.unread > 0;
  protected sortingFn: ISortingFunction = (a, b) => b.unread - a.unread;

  constructor(provider: string) {
    super(provider, `chat.treeView.unreads.${provider}`);
  }
}

export class ChannelTreeProvider extends BaseChannelsListTreeProvider {
  protected filterFn: IFilterFunction = c =>
    c.channel.type === ChannelType.channel;

  constructor(provider: string) {
    super(provider, `chat.treeView.channels.${provider}`);
  }
}

export class GroupTreeProvider extends BaseChannelsListTreeProvider {
  protected filterFn: IFilterFunction = c =>
    c.channel.type === ChannelType.group;

  constructor(provider: string) {
    super(provider, `chat.treeView.groups.${provider}`);
  }
}

export class IMsTreeProvider extends BaseChannelsListTreeProvider {
  protected filterFn: IFilterFunction = c => c.channel.type === ChannelType.im;

  constructor(provider: string) {
    super(provider, `chat.treeView.ims.${provider}`);
  }
}

export class OnlineUsersTreeProvider extends BaseChannelsListTreeProvider {
  private users: User[] = [];
  private imChannels: { [userId: string]: Channel } = {};
  private DM_ROLE_NAME = "Direct Messages";
  private OTHERS_ROLE_NAME = "Others";

  constructor(providerName: string) {
    super(providerName, `chat.treeView.onlineUsers.${providerName}`);
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
      channel: this.imChannels[user.id],
      team: undefined,
      providerName: this.providerName
    };
  }

  getChildrenForCategory = (element: ChatTreeNode) => {
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
  };

  getRootChildren = (): vscode.ProviderResult<ChatTreeNode[]> => {
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
  };

  getParent = (element: ChatTreeNode): vscode.ProviderResult<ChatTreeNode> => {
    return;
  };
}
