import { isSuperset, difference, toTitleCase } from "../utils";
import { VSLS_CHAT_CHANNEL } from "../vslsChat/utils";

export class ChatProviderManager {
  messages: Messages = {};
  currentUserPrefs: UserPreferences = {};
  stateFetchedAt: Date | undefined;

  constructor(
    private store: IStore,
    public providerName: string,
    public teamId: string | undefined,
    private chatProvider: IChatProvider,
    private parentManager: IManager
  ) {}

  getTeams(): Team[] {
    // Due to design limitation we can only work with one team at a time,
    // and so this only returns the current team. (or else, Discord shows
    // multiple status items for unread messages.)
    const currentTeam = this.getCurrentTeam();
    return !!currentTeam ? [currentTeam] : [];
  }

  getCurrentTeam(): Team | undefined {
    const currentUser = this.store.getCurrentUser(this.providerName);
    return !!currentUser
      ? currentUser.teams.find(team => team.id === currentUser.currentTeamId)
      : undefined;
  }

  initializeProvider = async (): Promise<any> => {
    const isConnected = this.chatProvider.isConnected();
    const isAuthenticated = this.isAuthenticated();
    let currentUser = this.store.getCurrentUser(this.providerName);

    if (!(isConnected && isAuthenticated)) {
      if (!!this.chatProvider) {
        currentUser = await this.chatProvider.connect();
        this.store.updateCurrentUser(this.providerName, currentUser);
      }
    }

    if (this.providerName === "vsls") {
      this.store.updateLastChannelId(this.providerName, VSLS_CHAT_CHANNEL.id);
    }

    return currentUser;
  };

  isAuthenticated() {
    const currentUserInfo = this.store.getCurrentUser(this.providerName);
    return !!currentUserInfo && !!currentUserInfo.id;
  }

  destroy() {
    this.chatProvider.destroy();
  }

  updateWebviewForLastChannel() {
    const lastChannelId = this.store.getLastChannelId(this.providerName);

    if (!!lastChannelId) {
      this.parentManager.updateWebviewForProvider(
        this.providerName,
        lastChannelId
      );
    }
  }

  async fetchThreadReplies(parentTimestamp: string) {
    const currentChannelId = this.store.getLastChannelId(this.providerName);

    if (!!currentChannelId) {
      const message = await this.chatProvider.fetchThreadReplies(
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

  updateSelfPresence = async (
    presence: UserPresence,
    durationInMinutes: number
  ) => {
    const currentUserInfo = this.store.getCurrentUser(this.providerName);

    if (!!currentUserInfo) {
      const presenceResult = await this.chatProvider.updateSelfPresence(
        presence,
        durationInMinutes
      );

      if (!!presenceResult) {
        this.updatePresenceForUser(currentUserInfo.id, presenceResult);
      }
    }
  };

  updatePresenceForUser = (userId: string, presence: UserPresence) => {
    const users = this.store.getUsers(this.providerName);

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

      this.store.updateUser(this.providerName, userId, {
        ...users[userId],
        presence
      });

      if (presence !== existingPresence) {
        this.parentManager.updateTreeViewsForProvider(this.providerName);
      }

      if (!!this.parentManager.vslsContactProvider) {
        this.parentManager.vslsContactProvider.notifyPresenceChanged(
          this.store.getUser(this.providerName, userId)
        );
      }
    }
  };

  sendMessage = (
    text: string,
    channelId: string,
    parentTimestamp: string | undefined
  ): Promise<void> => {
    const currentUserInfo = this.store.getCurrentUser(this.providerName);

    if (!!currentUserInfo) {
      if (!!parentTimestamp) {
        // This is a thread reply
        return this.chatProvider.sendThreadReply(
          text,
          currentUserInfo.id,
          channelId,
          parentTimestamp
        );
      } else {
        // THis is a normal message
        return this.chatProvider.sendMessage(
          text,
          currentUserInfo.id,
          channelId
        );
      }
    }

    return Promise.resolve();
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
    const users = this.store.getUsers(this.providerName);
    const knownUserIds = new Set(Object.keys(users));
    const channelMessages = this.messages[channelId];
    const entries = Object.entries(channelMessages);
    const userIds = new Set(entries.map(([_, message]) => message.userId));

    if (!isSuperset(knownUserIds, userIds)) {
      this.fillUpUsers(difference(userIds, knownUserIds));
    }

    this.updateWebviewForLastChannel();
    this.parentManager.updateStatusItemsForProvider(this.providerName);
    this.parentManager.updateTreeViewsForProvider(this.providerName);
  };

  private async fillUpUsers(missingIds: Set<any>): Promise<void> {
    // missingIds are user/bot ids that we don't have in the store. We will
    // fetch their details, and then update the UI.
    const users = this.store.getUsers(this.providerName);
    const usersCopy: Users = { ...users };
    let ids = Array.from(missingIds);

    await Promise.all(
      ids.map(async userId => {
        let user = await this.chatProvider.fetchUserInfo(userId);

        if (!!user) {
          const { id } = user;
          usersCopy[id] = user;
        }
      })
    );

    this.store.updateUsers(this.providerName, usersCopy);
    this.updateWebviewForLastChannel();
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

  async loadChannelHistory(channelId: string): Promise<void> {
    try {
      const messages = await this.chatProvider.loadChannelHistory(channelId);
      return this.updateMessages(channelId, messages);
    } catch (error) {
      return console.error(error);
    }
  }

  async updateUserPrefs() {
    const response = await this.chatProvider.getUserPreferences();

    if (!!response) {
      // We could also save the muted channels to local storage
      this.currentUserPrefs = response;
      this.parentManager.updateStatusItemsForProvider(this.providerName);
    }
  }

  async createIMChannel(user: User): Promise<Channel | undefined> {
    const channel = await this.chatProvider.createIMChannel(user);

    if (!!channel) {
      this.updateChannel(channel);
      return channel;
    }
  }

  subscribeForPresence() {
    const users = this.store.getUsers(this.providerName);

    if (!!this.chatProvider) {
      this.chatProvider.subscribePresence(users);
    }
  }

  updateChannel = (newChannel: Channel) => {
    // Adds/updates channel in this.channels
    let found = false;
    const channels = this.store.getChannels(this.providerName);
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

    this.store.updateChannels(this.providerName, updatedChannels);
    this.parentManager.updateTreeViewsForProvider(this.providerName);
  };

  updateChannelMarked(
    channelId: string,
    readTimestamp: string,
    unreadCount: number
  ) {
    const channel = this.getChannel(channelId);

    if (!!channel) {
      this.updateChannel({ ...channel, readTimestamp, unreadCount });
      this.updateWebviewForLastChannel();
      this.parentManager.updateStatusItemsForProvider(this.providerName);
      this.parentManager.updateTreeViewsForProvider(this.providerName);
    }
  }

  fetchUnreadCounts = async (channels: Channel[]) => {
    // We have to fetch twice here because Slack does not return the
    // historical unread counts for channels in the list API.
    const promises = channels.map(async channel => {
      const newChannel = await this.chatProvider.fetchChannelInfo(channel);

      if (!!newChannel && newChannel.unreadCount !== channel.unreadCount) {
        return this.updateChannel(newChannel);
      }
    });

    await Promise.all(promises);
    this.parentManager.updateStatusItemsForProvider(this.providerName);
  };

  fetchUsers = async (): Promise<Users> => {
    const users = await this.chatProvider.fetchUsers();
    let usersWithPresence: Users = {};
    const existingUsers = this.store.getUsers(this.providerName);

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

    this.store.updateUsers(this.providerName, usersWithPresence);
    return usersWithPresence;
  };

  fetchChannels = async (): Promise<Channel[]> => {
    const users = this.store.getUsers(this.providerName);
    const channels = await this.chatProvider.fetchChannels(users);
    await this.store.updateChannels(this.providerName, channels);
    this.parentManager.updateTreeViewsForProvider(this.providerName);
    this.fetchUnreadCounts(channels);
    return channels;
  };

  private shouldFetchNew = (lastFetchedAt: Date | undefined): boolean => {
    if (!lastFetchedAt) {
      return true;
    }

    const now = new Date();
    const difference = now.valueOf() - lastFetchedAt.valueOf();
    const FETCH_THRESHOLD = 15 * 60 * 1000; // 15-mins
    return difference > FETCH_THRESHOLD;
  };

  async initializeState(): Promise<void> {
    const users = this.store.getUsers(this.providerName);
    const hasCachedUsers = Object.keys(users).length !== 0;

    if (!hasCachedUsers) {
      await this.fetchUsers();
      const channels = this.store.getChannels(this.providerName);
      const hasCachedChannels = channels.length !== 0;

      if (!hasCachedChannels) {
        await this.fetchChannels();
        this.stateFetchedAt = new Date();
      }

      return;
    }

    // We already have a copy of the state, but if it's old, we run an async update
    if (this.shouldFetchNew(this.stateFetchedAt)) {
      this.fetchUsers().then(users => {
        this.fetchChannels();
        this.stateFetchedAt = new Date();
      });
    }
  }

  getChannel(channelId: string | undefined): Channel | undefined {
    if (!!channelId) {
      const channels = this.store.getChannels(this.providerName);
      return channels.find(channel => channel.id === channelId);
    }
  }

  getLastTimestamp(): string | undefined {
    const channelId = this.store.getLastChannelId(this.providerName);
    const channelMessages =
      !!channelId && channelId in this.messages ? this.messages[channelId] : {};
    const timestamps = Object.keys(channelMessages).map(tsString => +tsString);

    if (timestamps.length > 0) {
      return Math.max(...timestamps).toString();
    }
  }

  async updateReadMarker(): Promise<void> {
    const channelId = this.store.getLastChannelId(this.providerName);
    const channel = this.getChannel(channelId);
    const lastTs = this.getLastTimestamp();

    if (channel && lastTs) {
      const { readTimestamp } = channel;
      const hasNewerMsgs = !!readTimestamp ? +readTimestamp < +lastTs : true;

      if (hasNewerMsgs) {
        const incremented = (+lastTs + 1).toString(); // Slack API workaround
        const updatedChannel = await this.chatProvider.markChannel(
          channel,
          incremented
        );

        if (!!updatedChannel) {
          this.updateChannel(updatedChannel);
          this.updateWebviewForLastChannel();
          this.parentManager.updateStatusItemsForProvider(this.providerName);
          this.parentManager.updateTreeViewsForProvider(this.providerName);
        }
      }
    }
  }

  private isChannelMuted(channelId: string): boolean {
    const { mutedChannels } = this.currentUserPrefs;
    return !!mutedChannels && mutedChannels.indexOf(channelId) >= 0;
  }

  getUnreadCount(channel: Channel): number {
    const { id, readTimestamp, unreadCount } = channel;

    if (this.isChannelMuted(id)) {
      // This channel is muted, so return 0
      return 0;
    }

    const currentUserInfo = this.store.getCurrentUser(this.providerName);

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

  getChannelLabels(): ChannelLabel[] {
    const channels = this.store.getChannels(this.providerName);
    const users = this.store.getUsers(this.providerName);
    const providerName = toTitleCase(this.providerName);
    const currentTeam = this.getCurrentTeam();
    const teamName = !!currentTeam ? currentTeam.name : "";

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
        presence,
        providerName,
        teamName
      };
    });
  }

  getUserPresence(userId: string) {
    const user = this.store.getUser(this.providerName, userId);
    return !!user ? user.presence : undefined;
  }

  getCurrentUserPresence = () => {
    const currentUser = this.store.getCurrentUser(this.providerName);
    return !!currentUser ? this.getUserPresence(currentUser.id) : undefined;
  };
}
