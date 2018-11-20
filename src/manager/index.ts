import * as vscode from "vscode";
import * as semver from "semver";
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
import { VslsChatProvider } from "../vslsChat";
import { Store } from "../store";
import { ViewsManager } from "./views";
import { VSLS_CHAT_CHANNEL } from "../vslsChat/utils";
import ConfigHelper from "../config";
import { VslsContactProvider } from "./vslsContactProvider";

export default class Manager implements IManager, vscode.Disposable {
  token: string | undefined;
  currentUserPrefs: UserPreferences = {};
  channelsFetchedAt: Date | undefined;
  usersFetchedAt: Date | undefined;
  messages: Messages = {};
  chatProvider: IChatProvider | undefined;
  viewsManager: ViewsManager | undefined;
  vslsContactProvider: VslsContactProvider | undefined;

  constructor(public store: Store) {
    const existingVersion = this.store.existingVersion;
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

  getSelectedProvider(): string | undefined {
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

  getChatProvider(token: string, provider: string): IChatProvider {
    switch (provider) {
      case "discord":
        return new DiscordChatProvider(token, this);
      case "slack":
        return new SlackChatProvider(token, this);
      case "vsls":
        return new VslsChatProvider();
      default:
        throw new Error(`unsupport chat provider: ${provider}`);
    }
  }

  async validateToken(provider: string, token: string) {
    const chatProvider = this.getChatProvider(token, provider);
    const currentUser = await chatProvider.validateToken();
    return currentUser;
  }

  initializeToken = async (selectedProvider?: string) => {
    if (!selectedProvider) {
      selectedProvider = this.getSelectedProvider();
    }

    if (!!this.viewsManager) {
      this.viewsManager.dispose();
    }

    this.viewsManager = new ViewsManager(selectedProvider, this as IManager);

    if (!!selectedProvider) {
      const token = await ConfigHelper.getToken(selectedProvider);

      if (!!token) {
        this.chatProvider = this.getChatProvider(token, selectedProvider);
        this.token = token;

        const TREE_VIEW_PROVIDERS = ["slack", "discord"];
        TREE_VIEW_PROVIDERS.forEach(provider => {
          setVsContext(`chat:${provider}`, provider === selectedProvider);
        });
      }
    }
  };

  initializeProvider = async (): Promise<any> => {
    const isConnected = !!this.chatProvider
      ? this.chatProvider.isConnected()
      : false;
    const isAuthenticated = this.isAuthenticated();
    let currentUser = this.store.currentUserInfo;
    const provider = this.getSelectedProvider();

    if (!(isConnected && isAuthenticated)) {
      if (!!this.chatProvider) {
        currentUser = await this.chatProvider.connect();
        this.store.updateCurrentUser(currentUser);
      }
    }

    if (provider === "vsls") {
      this.store.updateLastChannelId(VSLS_CHAT_CHANNEL.id);
    }

    return currentUser;
  };

  initializeVslsContactProvider = async (): Promise<any> => {
    // This method is called after the users state has been initialized, since
    // the vsls contact provider uses list of users to match with vsls contacts.
    const provider = this.getSelectedProvider();
    const hasNonVslsChatProvider = !!provider && provider !== "vsls";

    if (hasVslsExtension() && hasNonVslsChatProvider) {
      const isNotAlreadyInit =
        !this.vslsContactProvider || !this.vslsContactProvider.isInitialized;
      const { currentUserInfo, users } = this.store;

      if (isNotAlreadyInit && !!currentUserInfo) {
        this.vslsContactProvider = new VslsContactProvider(
          <string>provider,
          this
        );
        await this.vslsContactProvider.register();

        const userId = currentUserInfo.id;
        const currentUser = users[userId];
        this.vslsContactProvider.notifySelfContact(currentUser);
        this.vslsContactProvider.notifyAvailableUsers(userId, users);
      }
    }
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
    if (!!this.viewsManager) {
      this.viewsManager.updateStatusItem();
      this.viewsManager.updateTreeViews();
      this.viewsManager.updateWebview();
    }
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

  getChannel(channelId: string | undefined): Channel | undefined {
    if (!!channelId) {
      return this.store.channels.find(channel => channel.id === channelId);
    }
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
      let presence: UserPresence = UserPresence.unknown;

      if (type === ChannelType.im) {
        const relatedUserId = Object.keys(users).find(value => {
          const user = users[value];
          const { name: username } = user;
          // Same issue as getIMChannel(), so we handle both
          return `@${username}` === name || username === name;
        });

        if (!!relatedUserId) {
          const relatedUser = users[relatedUserId];
          presence = relatedUser.presence;
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
        presence
      };
    });
  }

  getUserForId(userId: string) {
    return this.store.users[userId];
  }

  getIMChannel(user: User): Channel | undefined {
    // DM channels look like `name`
    const { name } = user;
    const { channels } = this.store;
    return channels.find(channel => channel.name === name);
  }

  async createIMChannel(user: User): Promise<Channel | undefined> {
    const channel = await (this.chatProvider as IChatProvider).createIMChannel(
      user
    );

    if (!!channel) {
      this.updateChannel(channel);
      return channel;
    }
  }

  getUnreadCount(channel: Channel): number {
    const { id, readTimestamp, unreadCount } = channel;

    if (this.isChannelMuted(id)) {
      // This channel is muted, so return 0
      return 0;
    }

    const { currentUserInfo } = this.store;

    if (!currentUserInfo) {
      // Can be undefined during async update on vsls chat
      return 0;
    }

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
        return !!team ? team.name : undefined;
      }
    }
  };

  getUserPresence(userId: string) {
    const user = this.store.users[userId];
    return !!user ? user.presence : undefined;
  }

  getCurrentUserPresence() {
    const { currentUserInfo } = this.store;
    return !!currentUserInfo
      ? this.getUserPresence(currentUserInfo.id)
      : undefined;
  }

  updatePresenceForUser = (userId: string, presence: UserPresence) => {
    const { users } = this.store;

    if (userId in users) {
      const existingPresence = users[userId].presence;

      if (
        existingPresence === UserPresence.invisible &&
        presence === UserPresence.offline
      ) {
        // If we know user is `invisible`, then `offline` presence change
        // should be ignored. This will only happen for self.
        return;
      }

      this.store.users[userId] = {
        ...users[userId],
        presence
      };

      if (presence !== existingPresence && !!this.viewsManager) {
        this.viewsManager.updateTreeViews();
      }

      if (!!this.vslsContactProvider) {
        this.vslsContactProvider.notifyPresenceChanged(
          this.store.users[userId]
        );
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

    if (!!this.viewsManager) {
      this.viewsManager.updateTreeViews();
    }
  };

  fetchUsers = async (): Promise<Users> => {
    const users = await (this.chatProvider as IChatProvider).fetchUsers();
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
      let calculatedPresence: UserPresence;

      if (newUser.presence !== UserPresence.unknown) {
        calculatedPresence = newUser.presence;
      } else {
        calculatedPresence = !!existingUser
          ? existingUser.presence
          : UserPresence.unknown;
      }

      usersWithPresence[userId] = {
        ...users[userId],
        presence: calculatedPresence
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
      const newChannel = await (this
        .chatProvider as IChatProvider).fetchChannelInfo(channel);

      if (!!newChannel && newChannel.unreadCount !== channel.unreadCount) {
        return this.updateChannel(newChannel);
      }
    });

    await Promise.all(promises);

    if (!!this.viewsManager) {
      this.viewsManager.updateStatusItem();
    }
  };

  fetchChannels = async (): Promise<Channel[]> => {
    const { users } = this.store;
    const channels = await (this.chatProvider as IChatProvider).fetchChannels(
      users
    );
    await this.store.updateChannels(channels);
    this.updateChannelsFetchedAt();

    if (!!this.viewsManager) {
      this.viewsManager.updateTreeViews();
    }

    this.fetchUnreadCounts(channels);
    return channels;
  };

  shouldFetchNew = (lastFetchedAt: Date | undefined): boolean => {
    if (!lastFetchedAt) {
      return true;
    }

    const now = new Date();
    const difference = now.valueOf() - lastFetchedAt.valueOf();
    const FETCH_THRESHOLD = 15 * 60 * 1000; // 15-mins
    return difference > FETCH_THRESHOLD;
  };

  initializeUsersState(): Promise<Users> {
    function isNotEmpty(obj: any) {
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

  initializeChannelsState(): Promise<Channel[]> {
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

  updateCurrentWorkspace = (
    team: Team,
    existingUserInfo: CurrentUser
  ): Thenable<void> => {
    const newCurrentUser: CurrentUser = {
      ...existingUserInfo,
      currentTeamId: team.id
    };
    return this.store.updateCurrentUser(newCurrentUser);
  };

  updateMessages = (
    channelId: string,
    messages: ChannelMessagesWithUndefined
  ) => {
    const existingMessages =
      channelId in this.messages ? this.messages[channelId] : {};
    const deletedTimestamps = Object.keys(messages).filter(
      ts => typeof messages[ts] === "undefined"
    );

    const newMessages: ChannelMessages = {};
    Object.keys(existingMessages).forEach(ts => {
      const isDeleted = deletedTimestamps.indexOf(ts) >= 0;
      if (!isDeleted) {
        newMessages[ts] = existingMessages[ts];
      }
    });
    Object.keys(messages).forEach(ts => {
      const message = messages[ts];
      if (!!message) {
        newMessages[ts] = message;
      }
    });
    this.messages[channelId] = newMessages;

    // Remove undefined, after message deleted
    Object.keys(this.messages[channelId]).forEach(key => {
      if (typeof this.messages[channelId][key] === "undefined") {
        delete this.messages[channelId][key];
      }
    });

    // Check if we have all users. Since there is no `bots.list` Slack API
    // method, it is possible that a bot user is not in our store
    const { users } = this.store;
    const knownUserIds = new Set(Object.keys(users));
    const channelMessages = this.messages[channelId];
    const entries = Object.entries(channelMessages);
    const userIds = new Set(entries.map(([_, message]) => message.userId));

    if (!isSuperset(knownUserIds, userIds)) {
      this.fillUpUsers(difference(userIds, knownUserIds));
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
        let user = await (this.chatProvider as IChatProvider).fetchUserInfo(
          userId
        );

        if (!!user) {
          const { id } = user;
          usersCopy[id] = user;
        }
      })
    );

    this.store.updateUsers(usersCopy);

    if (!!this.viewsManager) {
      return this.viewsManager.updateWebview();
    }
  }

  async loadChannelHistory(channelId: string): Promise<void> {
    try {
      const messages = await (this
        .chatProvider as IChatProvider).loadChannelHistory(channelId);
      return this.updateMessages(channelId, messages);
    } catch (error) {
      return console.error(error);
    }
  }

  async updateUserPrefs() {
    const response = await (this
      .chatProvider as IChatProvider).getUserPreferences();

    if (!!response) {
      // We could also save the muted channels to local storage
      this.currentUserPrefs = response;

      if (!!this.viewsManager) {
        this.viewsManager.updateStatusItem();
      }
    }
  }

  getLastTimestamp(): string | undefined {
    const { lastChannelId: channelId } = this.store;
    const channelMessages =
      !!channelId && channelId in this.messages ? this.messages[channelId] : {};
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
      const hasNewerMsgs = !!readTimestamp ? +readTimestamp < +lastTs : true;

      if (hasNewerMsgs) {
        const incremented = (+lastTs + 1).toString(); // Slack API workaround
        const updatedChannel = await (this
          .chatProvider as IChatProvider).markChannel(channel, incremented);

        if (!!updatedChannel) {
          this.updateChannel(updatedChannel);
          this.updateAllUI();
        }
      }
    }
  }

  sendMessage = (
    text: string,
    channelId: string,
    parentTimestamp: string | undefined
  ): Promise<void> => {
    const { currentUserInfo } = this.store;

    if (!!currentUserInfo) {
      if (!!parentTimestamp) {
        // This is a thread reply
        return (this.chatProvider as IChatProvider).sendThreadReply(
          text,
          currentUserInfo.id,
          channelId,
          parentTimestamp
        );
      } else {
        // THis is a normal message
        return (this.chatProvider as IChatProvider).sendMessage(
          text,
          currentUserInfo.id,
          channelId
        );
      }
    }

    return Promise.resolve();
  };

  getCurrentPresence = () => {
    const { currentUserInfo, users } = this.store;

    if (!!currentUserInfo) {
      const currentUser = users[currentUserInfo.id];
      return currentUser.presence;
    }
  };

  updateSelfPresence = async (
    presence: UserPresence,
    durationInMinutes: number
  ) => {
    const { currentUserInfo } = this.store;

    if (!!this.chatProvider && !!currentUserInfo) {
      const presenceResult = await this.chatProvider.updateSelfPresence(
        presence,
        durationInMinutes
      );

      if (!!presenceResult) {
        this.updatePresenceForUser(currentUserInfo.id, presenceResult);
      }
    }
  };

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
        const newMessages: ChannelMessages = {};
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
        const newMessages: ChannelMessages = {};
        newMessages[msgTimestamp] = newMessage;
        this.updateMessages(channelId, newMessages);
      }
    }
  }

  async fetchThreadReplies(parentTimestamp: string) {
    const currentChannelId = this.store.lastChannelId;

    if (!!currentChannelId) {
      const message = await (this
        .chatProvider as IChatProvider).fetchThreadReplies(
        currentChannelId,
        parentTimestamp
      );

      if (!!message) {
        let messages: ChannelMessages = {};
        messages[parentTimestamp] = message;
        this.updateMessages(currentChannelId, messages);
      }
    }
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
      let newMessages: ChannelMessages = {};
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
