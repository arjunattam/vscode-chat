import * as vscode from "vscode";
import * as semver from "semver";
import {
  Channel,
  CurrentUser,
  ChannelMessages,
  Messages,
  Users,
  IManager,
  User,
  Team,
  ChannelType,
  ChannelLabel,
  UserPreferences,
  IChatProvider,
  MessageReply,
  MessageReplies,
  Providers
} from "../types";
import Logger from "../logger";
import {
  getExtensionVersion,
  isSuperset,
  difference,
  setVsContext,
  hasVslsExtension
} from "../utils";
import { DiscordChatProvider } from "../discord";
import { SlackChatProvider } from "../slack";
import { VslsChatProvider } from "../vsls";
import { Store } from "../store";
import { ViewsManager } from "./views";

export default class Manager implements IManager, vscode.Disposable {
  token: string;
  channelsFetchedAt: Date;
  currentUserPrefs: UserPreferences = {};
  usersFetchedAt: Date;
  messages: Messages = {};
  chatProvider: IChatProvider;
  viewsManager: ViewsManager;

  constructor(public store: Store) {
    const existingVersion: string = this.store.existingVersion;
    const currentVersion = getExtensionVersion();

    if (!!currentVersion && existingVersion !== currentVersion) {
      // There has been an upgrade. Apply data migrations if required.
      Logger.log(`Extension updated to ${currentVersion}`);

      if (!!existingVersion) {
        if (semver.lt(existingVersion, "0.6.0")) {
          Logger.log("Migration for 0.6.0: add slack as default provider");
          const { currentUserInfo } = this.store;

          if (!!currentUserInfo) {
            const userInfo = { ...currentUserInfo, provider: Providers.slack };
            this.store.updateCurrentUser(userInfo);
          }
        }
      }

      this.store.updateExtensionVersion(currentVersion);
    }
  }

  getSelectedProvider() {
    // First check if we have a saved user profile
    // Else return default (vsls, if extension exists)
    const { currentUserInfo } = this.store;

    if (!!currentUserInfo) {
      return currentUserInfo.provider;
    }

    const hasVsls = hasVslsExtension();

    if (hasVsls) {
      return Providers.vsls;
    }
  }

  getChatProvider(provider: string): IChatProvider {
    switch (provider) {
      case "discord":
        return new DiscordChatProvider(this);
      case "slack":
        return new SlackChatProvider();
      case "vsls":
        return new VslsChatProvider();
    }
  }

  async validateToken(provider: string, token: string) {
    const chatProvider = this.getChatProvider(provider);
    const currentUser = await chatProvider.validateToken(token);
    return currentUser;
  }

  initializeToken = async (selectedProvider?: string) => {
    if (!selectedProvider) {
      selectedProvider = this.getSelectedProvider();
    }

    if (!!this.viewsManager) {
      this.viewsManager.dispose();
    }

    this.viewsManager = new ViewsManager(selectedProvider, this);

    if (!!selectedProvider) {
      this.chatProvider = this.getChatProvider(selectedProvider);
      const token = await this.chatProvider.getToken();
      this.token = token;

      const ALL_PROVIDERS = ["slack", "discord"];
      ALL_PROVIDERS.forEach(provider => {
        setVsContext(`chat:${provider}`, provider === selectedProvider);
      });
    }
  };

  initializeProvider = async (): Promise<any> => {
    const isConnected = this.chatProvider.isConnected();
    const isAuthenticated = this.isAuthenticated();
    let currentUser = this.store.currentUserInfo;

    if (!(isConnected && isAuthenticated)) {
      currentUser = await this.chatProvider.connect();
      this.store.updateCurrentUser(currentUser);
    }

    return currentUser;
  };

  clearAll() {
    this.store.updateCurrentUser(undefined);
    this.clearOldWorkspace();
  }

  clearOldWorkspace() {
    // This clears workspace info, does not clear current user
    this.store.updateLastChannelId(undefined);
    this.store.updateChannels([]);
    this.store.updateUsers({});
    this.usersFetchedAt = undefined;
    this.channelsFetchedAt = undefined;
    this.messages = {};
    this.token = undefined;

    if (!!this.chatProvider) {
      this.chatProvider.destroy();
    }
  }

  updateAllUI() {
    this.viewsManager.updateStatusItem();
    this.viewsManager.updateTreeViews();
    this.viewsManager.updateWebview();
  }

  dispose() {
    if (!!this.viewsManager) {
      this.viewsManager.dispose();
    }
  }

  isAuthenticated() {
    const { currentUserInfo } = this.store;
    return !!currentUserInfo && !!currentUserInfo.id;
  }

  getChannel(channelId: string): Channel {
    return this.store.channels.find(channel => channel.id === channelId);
  }

  isChannelMuted(channelId: string): boolean {
    const { mutedChannels } = this.currentUserPrefs;
    return !!mutedChannels && mutedChannels.indexOf(channelId) >= 0;
  }

  getChannelLabels(): ChannelLabel[] {
    const { users, channels } = this.store;
    return channels.map(channel => {
      const unread = this.getUnreadCount(channel);
      const { name, type, id } = channel;
      const isMuted = this.isChannelMuted(id);
      let isOnline = false;

      if (type === ChannelType.im) {
        const relatedUserId = Object.keys(users).find(value => {
          const user = users[value];
          const { name: username } = user;
          // Same issue as getIMChannel(), so we handle both
          return `@${username}` === name || username === name;
        });

        if (!!relatedUserId) {
          const relatedUser = users[relatedUserId];
          isOnline = relatedUser.isOnline;
        }
      }

      let label;

      if (unread > 0) {
        label = `${name} ${unread > 0 ? `(${unread} new)` : ""}`;
      } else if (isMuted) {
        label = `${name} (muted)`;
      } else {
        label = `${name}`;
      }

      return {
        channel,
        unread,
        label,
        isOnline
      };
    });
  }

  getIMChannel(user: User): Channel | undefined {
    // DM channels look like `name`
    const { name } = user;
    const { channels } = this.store;
    return channels.find(channel => channel.name === name);
  }

  async createIMChannel(user: User): Promise<Channel> {
    const channel = await this.chatProvider.createIMChannel(user);
    this.updateChannel(channel);
    return channel;
  }

  getUnreadCount(channel: Channel): number {
    const { id, readTimestamp, unreadCount } = channel;

    if (this.isChannelMuted(id)) {
      // This channel is muted, so return 0
      return 0;
    }

    const { currentUserInfo } = this.store;
    const messages = id in this.messages ? this.messages[id] : {};

    const unreadMessages = Object.keys(messages).filter(ts => {
      const isDifferentUser = messages[ts].userId !== currentUserInfo.id;
      const isNewTimestamp = !!readTimestamp ? +ts > +readTimestamp : false;
      return isDifferentUser && isNewTimestamp;
    });

    return unreadCount ? unreadCount : unreadMessages.length;
  }

  getCurrentWorkspaceName = () => {
    const { currentUserInfo } = this.store;

    if (!!currentUserInfo) {
      const { teams, currentTeamId } = currentUserInfo;

      if (!!currentTeamId) {
        const team = teams.find(team => team.id === currentTeamId);
        return team.name;
      }
    }
  };

  updateUserPresence = (userId: string, isOnline: boolean) => {
    const { users } = this.store;

    if (userId in users) {
      const existingIsOnline = users[userId].isOnline;
      this.store.users[userId] = {
        ...users[userId],
        isOnline
      };

      if (isOnline !== existingIsOnline) {
        this.viewsManager.updateTreeViews();
      }
    }
  };

  updateUsersFetchedAt = () => {
    this.usersFetchedAt = new Date();
  };

  updateChannelsFetchedAt = () => {
    this.channelsFetchedAt = new Date();
  };

  updateChannel = (newChannel: Channel) => {
    // Adds/updates channel in this.channels
    let found = false;
    const { channels } = this.store;
    let updatedChannels = channels.map(channel => {
      const { id } = channel;

      if (id === newChannel.id) {
        found = true;
        return {
          ...channel,
          ...newChannel
        };
      } else {
        return channel;
      }
    });

    if (!found) {
      updatedChannels = [...updatedChannels, newChannel];
    }

    this.store.updateChannels(updatedChannels);
    this.viewsManager.updateTreeViews();
  };

  fetchUsers = async (): Promise<Users> => {
    const users = await this.chatProvider.fetchUsers();
    let usersWithPresence: Users = {};
    const { users: existingUsers } = this.store;

    Object.keys(users).forEach(userId => {
      // This handles two different chat providers:
      // In slack, we will get isOnline as undefined, because this API
      //    does not know about user presence
      // In discord, we will get true/false
      const existingUser =
        userId in existingUsers ? existingUsers[userId] : null;
      const newUser = users[userId];
      let calculatedIsOnline: boolean;

      if (newUser.isOnline !== undefined) {
        calculatedIsOnline = newUser.isOnline;
      } else {
        calculatedIsOnline = !!existingUser ? existingUser.isOnline : false;
      }

      usersWithPresence[userId] = {
        ...users[userId],
        isOnline: calculatedIsOnline
      };
    });

    this.store.updateUsers(usersWithPresence);
    this.updateUsersFetchedAt();
    return usersWithPresence;
  };

  fetchUnreadCounts = async (channels: Channel[]) => {
    // We have to fetch twice here because Slack does not return the
    // historical unread counts for channels in the list API.
    const promises = channels.map(async channel => {
      const newChannel = await this.chatProvider.fetchChannelInfo(channel);
      // TODO: only update when we have a different unread
      return this.updateChannel(newChannel);
    });
    await Promise.all(promises);
    this.viewsManager.updateStatusItem();
  };

  fetchChannels = async (): Promise<Channel[]> => {
    const { users } = this.store;
    const channels = await this.chatProvider.fetchChannels(users);
    await this.store.updateChannels(channels);
    this.updateChannelsFetchedAt();
    this.viewsManager.updateTreeViews();
    this.fetchUnreadCounts(channels);
    return channels;
  };

  shouldFetchNew = (lastFetchedAt: Date): boolean => {
    if (!lastFetchedAt) {
      return true;
    }

    const now = new Date();
    const difference = now.valueOf() - lastFetchedAt.valueOf();
    const FETCH_THRESHOLD = 15 * 60 * 1000; // 15-mins
    return difference > FETCH_THRESHOLD;
  };

  getUsersPromise(): Promise<Users> {
    function isNotEmpty(obj) {
      return Object.keys(obj).length !== 0;
    }

    const { users } = this.store;
    return isNotEmpty(users)
      ? new Promise(resolve => {
          if (this.shouldFetchNew(this.usersFetchedAt)) {
            this.fetchUsers(); // async update
          }
          resolve(users);
        })
      : this.fetchUsers();
  }

  getChannelsPromise(): Promise<Channel[]> {
    // This assumes that users are available
    const { channels } = this.store;
    return !!channels
      ? new Promise(resolve => {
          if (this.shouldFetchNew(this.channelsFetchedAt)) {
            this.fetchChannels(); // async update
          }

          resolve(channels);
        })
      : this.fetchChannels();
  }

  updateCurrentWorkspace = (team: Team): Thenable<void> => {
    const { currentUserInfo } = this.store;
    const newCurrentUser: CurrentUser = {
      ...currentUserInfo,
      currentTeamId: team.id
    };
    return this.store.updateCurrentUser(newCurrentUser);
  };

  updateMessages = (channelId: string, newMessages: ChannelMessages) => {
    const channelMessages = { ...this.messages[channelId], ...newMessages };
    this.messages[channelId] = channelMessages;

    // Remove undefined, after message deleted
    Object.keys(this.messages[channelId]).forEach(key => {
      if (typeof this.messages[channelId][key] === "undefined") {
        delete this.messages[channelId][key];
      }
    });

    // Check if we have all users. Since there is not bots.list API
    // method, it is possible that a bot user is not in our store
    const { users } = this.store;
    const userIds = new Set(
      (<any>Object)
        .values(this.messages[channelId])
        .map(message => message.userId)
    );
    const allIds = new Set(Object.keys(users));
    if (!isSuperset(allIds, userIds)) {
      this.fillUpUsers(difference(userIds, allIds));
    }

    this.updateAllUI();
  };

  async fillUpUsers(missingIds: Set<any>): Promise<void> {
    // missingIds are user/bot ids that we don't have in the store. We will
    // fetch their details, and then update the UI.
    const { users } = this.store;
    const usersCopy = { ...users };
    let ids = Array.from(missingIds);

    await Promise.all(
      ids.map(async userId => {
        let user = await this.chatProvider.fetchUserInfo(userId);
        const { id } = user;
        usersCopy[id] = user;
      })
    );

    this.store.updateUsers(usersCopy);
    return this.viewsManager.updateWebview();
  }

  async loadChannelHistory(channelId: string): Promise<void> {
    try {
      const messages = await this.chatProvider.loadChannelHistory(channelId);
      return this.updateMessages(channelId, messages);
    } catch (error) {
      return console.error(error);
    }
  }

  async updateUserPrefs() {
    const response = await this.chatProvider.getUserPrefs();
    // We could also save the muted channels to local storage
    this.currentUserPrefs = response;
    this.viewsManager.updateStatusItem();
  }

  getLastTimestamp(): string {
    const id = this.store.lastChannelId;
    const channelMessages = id in this.messages ? this.messages[id] : {};
    const timestamps = Object.keys(channelMessages).map(tsString => +tsString);

    if (timestamps.length > 0) {
      return Math.max(...timestamps).toString();
    }
  }

  async updateReadMarker(): Promise<void> {
    const channelId = this.store.lastChannelId;
    const channel = this.getChannel(channelId);
    const lastTs = this.getLastTimestamp();

    if (channel && lastTs) {
      const { readTimestamp } = channel;
      const hasNewerMsgs = +readTimestamp < +lastTs;

      if (!readTimestamp || hasNewerMsgs) {
        const channel = this.getChannel(channelId);
        const incremented = (+lastTs + 1).toString(); // Slack API workaround
        const updatedChannel = await this.chatProvider.markChannel(
          channel,
          incremented
        );
        this.updateChannel(updatedChannel);
        this.updateAllUI();
      }
    }
  }

  addReaction(
    channelId: string,
    msgTimestamp: string,
    userId: string,
    reactionName: string
  ) {
    if (channelId in this.messages) {
      const channelMessages = this.messages[channelId];

      if (msgTimestamp in channelMessages) {
        const message = channelMessages[msgTimestamp];
        let { reactions } = message;
        const existing = reactions.find(r => r.name === reactionName);

        if (existing) {
          reactions = reactions.map(r => {
            if (r.name === reactionName) {
              return {
                ...existing,
                count: existing.count + 1,
                userIds: [...existing.userIds, userId]
              };
            } else {
              return { ...r };
            }
          });
        } else {
          reactions = [
            ...reactions,
            { name: reactionName, userIds: [userId], count: 1 }
          ];
        }

        const newMessage = {
          ...message,
          reactions
        };
        const newMessages = {};
        newMessages[msgTimestamp] = newMessage;
        this.updateMessages(channelId, newMessages);
      }
    }
  }

  removeReaction(
    channelId: string,
    msgTimestamp: string,
    userId: string,
    reactionName: string
  ) {
    if (channelId in this.messages) {
      const channelMessages = this.messages[channelId];

      if (msgTimestamp in channelMessages) {
        const message = channelMessages[msgTimestamp];
        let { reactions } = message;
        reactions = reactions
          .map(r => {
            if (r.name === reactionName) {
              return {
                ...r,
                count: r.count - 1,
                userIds: r.userIds.filter(u => u !== userId)
              };
            } else {
              return { ...r };
            }
          })
          .filter(r => r.count > 0);

        const newMessage = {
          ...message,
          reactions
        };
        const newMessages = {};
        newMessages[msgTimestamp] = newMessage;
        this.updateMessages(channelId, newMessages);
      }
    }
  }

  async fetchThreadReplies(parentTimestamp: string) {
    const currentChannelId = this.store.lastChannelId;
    const message = await this.chatProvider.fetchThreadReplies(
      currentChannelId,
      parentTimestamp
    );

    let messages = {};
    messages[parentTimestamp] = message;
    this.updateMessages(currentChannelId, messages);
  }

  updateMessageReply(
    parentTimestamp: string,
    channelId: string,
    reply: MessageReply
  ) {
    // We need to have the message in our store, else we
    // ignore this reply
    const messages = channelId in this.messages ? this.messages[channelId] : {};
    const message =
      parentTimestamp in messages ? messages[parentTimestamp] : undefined;

    if (!!message) {
      let newMessages = {};
      const replyTs = reply.timestamp;
      let replies: MessageReplies = { ...message.replies };
      replies[replyTs] = { ...reply };
      newMessages[parentTimestamp] = {
        ...message,
        replies
      };
      this.updateMessages(channelId, newMessages);
    }
  }
}
