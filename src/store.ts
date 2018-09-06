import * as vscode from "vscode";
import * as semver from "semver";
import {
  Channel,
  CurrentUser,
  ChannelMessages,
  Messages,
  Users,
  IStore,
  UIMessage,
  User,
  ChannelType,
  ChannelLabel,
  UserPreferences,
  IChatProvider,
  MessageReply
} from "./interfaces";
import StatusItem from "./status";
import Logger from "./logger";
import { getExtensionVersion } from "./utils";
import {
  UnreadsTreeProvider,
  ChannelTreeProvider,
  GroupTreeProvider,
  IMsTreeProvider,
  OnlineUsersTreeProvider
} from "./tree";

const stateKeys = {
  EXTENSION_VERSION: "extensionVersion",
  INSTALLATION_ID: "installationId",
  LAST_CHANNEL_ID: "lastChannelId",
  CHANNELS: "channels",
  USER_INFO: "userInfo",
  USERS: "users"
};

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isSuperset(set, subset) {
  for (var elem of subset) {
    if (!set.has(elem)) {
      return false;
    }
  }
  return true;
}

function difference(setA, setB) {
  var _difference = new Set(setA);
  for (var elem of setB) {
    _difference.delete(elem);
  }
  return _difference;
}

export default class Store implements IStore, vscode.Disposable {
  token: string;
  installationId: string;
  lastChannelId: string;
  // TODO: storage quota is getting exceeded for discord
  channels: Channel[] = [];
  channelsFetchedAt: Date;
  currentUserInfo: CurrentUser;
  currentUserPrefs: UserPreferences = {};
  users: Users = {};
  usersFetchedAt: Date;
  messages: Messages = {};

  // We could merge these 3 store subscribers with one protocol
  uiCallback: (message: UIMessage) => void;
  statusItem: StatusItem;

  // Tree providers
  unreadsTreeProvider: UnreadsTreeProvider;
  channelsTreeProvider: ChannelTreeProvider;
  imsTreeProvider: IMsTreeProvider;
  groupsTreeProvider: GroupTreeProvider;
  usersTreeProvider: OnlineUsersTreeProvider;

  constructor(
    private context: vscode.ExtensionContext,
    private chatProvider: IChatProvider
  ) {
    const { globalState } = context;
    this.channels = globalState.get(stateKeys.CHANNELS);
    this.currentUserInfo = globalState.get(stateKeys.USER_INFO);
    this.users = globalState.get(stateKeys.USERS);
    this.lastChannelId = globalState.get(stateKeys.LAST_CHANNEL_ID);
    this.installationId = globalState.get(stateKeys.INSTALLATION_ID);

    this.statusItem = new StatusItem();

    // Setup tree providers
    this.unreadsTreeProvider = new UnreadsTreeProvider();
    this.channelsTreeProvider = new ChannelTreeProvider();
    this.groupsTreeProvider = new GroupTreeProvider();
    this.imsTreeProvider = new IMsTreeProvider();
    this.usersTreeProvider = new OnlineUsersTreeProvider();

    // Extension version migrations
    const existingVersion = globalState.get(stateKeys.EXTENSION_VERSION);
    const currentVersion = getExtensionVersion();

    if (existingVersion !== currentVersion) {
      // There has been an upgrade. Apply data migrations if required.
      Logger.log(`Extension updated to ${currentVersion}`);

      if (!existingVersion && semver.gte(currentVersion, "0.5.6")) {
        // Migration for changed user names
        Logger.log("Migrating for 0.5.6");
        this.updateChannels([]);
        this.updateUsers({});
        this.usersFetchedAt = null;
        this.channelsFetchedAt = null;
      }

      globalState.update(stateKeys.EXTENSION_VERSION, currentVersion);
      const newstate = globalState.get(stateKeys.EXTENSION_VERSION);
      Logger.log(`Updated state to new version: ${newstate}`);
    }
  }

  initializeToken = async () => {
    const token = await this.chatProvider.getToken();
    this.token = token;
  };

  generateInstallationId() {
    const uuidStr = uuidv4();
    const { globalState } = this.context;
    globalState.update(stateKeys.INSTALLATION_ID, uuidStr);
    this.installationId = uuidStr;
  }

  clear() {
    this.updateLastChannelId(undefined);
    this.updateChannels([]);
    this.updateCurrentUser(undefined);
    this.updateUsers({});

    this.usersFetchedAt = undefined;
    this.channelsFetchedAt = undefined;
    this.messages = {};
    this.token = undefined;
  }

  updateAllUI() {
    this.updateUnreadCount();
    this.updateTreeViews();
    this.updateWebviewUI();
  }

  dispose() {
    this.statusItem.dispose();
    this.unreadsTreeProvider.dispose();
    this.channelsTreeProvider.dispose();
    this.groupsTreeProvider.dispose();
    this.imsTreeProvider.dispose();
    this.usersTreeProvider.dispose();
  }

  isAuthenticated() {
    return !!this.token;
  }

  setUiCallback(uiCallback) {
    this.uiCallback = uiCallback;
  }

  getChannel(channelId: string): Channel {
    return this.channels.find(channel => channel.id === channelId);
  }

  isChannelMuted(channelId: string): boolean {
    const { mutedChannels } = this.currentUserPrefs;
    return !!mutedChannels && mutedChannels.indexOf(channelId) >= 0;
  }

  getChannelLabels(): ChannelLabel[] {
    return this.channels.map(channel => {
      const unread = this.getUnreadCount(channel);
      const { name, type, id } = channel;
      const isMuted = this.isChannelMuted(id);
      let isOnline = false;

      if (type === ChannelType.im) {
        const relatedUserId = Object.keys(this.users).find(value => {
          const user = this.users[value];
          const { name: username } = user;
          return `@${username}` === name;
        });

        if (!!relatedUserId) {
          const relatedUser = this.users[relatedUserId];
          isOnline = relatedUser.isOnline;
        }
      }

      let icon, label;
      switch (type) {
        case ChannelType.channel:
          icon = "comment";
          break;
        case ChannelType.group:
          icon = name.startsWith("@") ? "organization" : "lock";
          break;
        case ChannelType.im:
          icon = "person";
          break;
      }

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
        icon,
        label,
        isOnline
      };
    });
  }

  getIMChannel(user: User): Channel | undefined {
    return this.channels.find(channel => channel.name === `@${user.name}`);
  }

  createIMChannel(user: User): Promise<Channel> {
    return this.chatProvider.createIMChannel(user).then(channel => {
      this.updateChannel(channel);
      return channel;
    });
  }

  updateWebviewUI() {
    const channel = this.getChannel(this.lastChannelId);
    const messages =
      this.lastChannelId in this.messages
        ? this.messages[this.lastChannelId]
        : {};

    if (!!this.uiCallback) {
      this.uiCallback({
        messages,
        users: this.users,
        currentUser: this.currentUserInfo,
        channel,
        statusText: ""
      });
    }
  }

  getUnreadCount(channel: Channel): number {
    const { id, readTimestamp, unreadCount } = channel;

    if (this.isChannelMuted(id)) {
      // This channel is muted, so return 0
      return 0;
    }

    const messages = id in this.messages ? this.messages[id] : {};
    const unreadMessages = Object.keys(messages).filter(ts => {
      const isDifferentUser = messages[ts].userId !== this.currentUserInfo.id;
      const isNewTimestamp = !!readTimestamp ? +ts > +readTimestamp : false;
      return isDifferentUser && isNewTimestamp;
    });
    return unreadCount ? unreadCount : unreadMessages.length;
  }

  updateTreeViews() {
    const isAuthenticated = this.isAuthenticated();
    const channelLabels = this.getChannelLabels();
    this.unreadsTreeProvider.showData(isAuthenticated, channelLabels);
    this.channelsTreeProvider.showData(isAuthenticated, channelLabels);
    this.groupsTreeProvider.showData(isAuthenticated, channelLabels);
    this.imsTreeProvider.showData(isAuthenticated, channelLabels);

    // We could possibly split this function for channel-updates and user-updates
    // to avoid extra UI refresh calls.
    const imChannels = {};
    Object.keys(this.users).forEach(userId => {
      imChannels[userId] = this.getIMChannel(this.users[userId]);
    });

    this.usersTreeProvider.updateData(
      isAuthenticated,
      this.currentUserInfo,
      this.users,
      imChannels
    );
  }

  updateUnreadCount() {
    const unreads = this.channels.map(channel => this.getUnreadCount(channel));
    const totalUnreads = unreads.reduce((a, b) => a + b, 0);
    this.statusItem.updateCount(totalUnreads);
  }

  updateUserPresence = (userId: string, isOnline: boolean) => {
    if (userId in this.users) {
      this.users[userId] = {
        ...this.users[userId],
        isOnline
      };

      this.updateTreeViews();
    }
  };

  updateUsers = users => {
    this.users = users;
    this.context.globalState.update(stateKeys.USERS, users);
  };

  updateUsersFetchedAt = () => {
    this.usersFetchedAt = new Date();
  };

  updateChannelsFetchedAt = () => {
    this.channelsFetchedAt = new Date();
  };

  updateChannels = channels => {
    this.channels = channels;
    this.context.globalState.update(stateKeys.CHANNELS, channels);
  };

  updateChannel = (newChannel: Channel) => {
    // Adds/updates channel in this.channels
    let found = false;
    let updatedChannels = this.channels.map(channel => {
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

    this.updateChannels(updatedChannels);
    this.updateTreeViews();
  };

  fetchUsers = (): Promise<Users> => {
    return this.chatProvider.fetchUsers().then((users: Users) => {
      // Update users for their presence status, if already known
      let usersWithPresence: Users = {};

      Object.keys(users).forEach(userId => {
        const existingUser = userId in this.users ? this.users[userId] : null;
        usersWithPresence[userId] = {
          ...users[userId],
          isOnline: !!existingUser ? existingUser.isOnline : false
        };
      });

      this.updateUsers(usersWithPresence);
      this.updateUsersFetchedAt();
      return users;
    });
  };

  fetchChannels = (): Promise<Channel[]> => {
    return this.chatProvider.fetchChannels(this.users).then(channels => {
      this.updateChannels(channels);
      this.updateChannelsFetchedAt();
      this.updateTreeViews();

      // TODO: why are we fetching twice?
      const promises = channels.map(channel =>
        this.chatProvider
          .fetchChannelInfo(channel)
          .then((newChannel: Channel) => {
            return this.updateChannel(newChannel);
          })
      );

      Promise.all(promises).then(() => this.updateUnreadCount());
      return channels;
    });
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

    return isNotEmpty(this.users)
      ? new Promise(resolve => {
          if (this.shouldFetchNew(this.usersFetchedAt)) {
            this.fetchUsers(); // async update
          }
          resolve(this.users);
        })
      : this.fetchUsers();
  }

  getChannelsPromise(): Promise<Channel[]> {
    // This assumes that users are available
    return !!this.channels
      ? new Promise(resolve => {
          if (this.shouldFetchNew(this.channelsFetchedAt)) {
            this.fetchChannels(); // async update
          }
          resolve(this.channels);
        })
      : this.fetchChannels();
  }

  updateLastChannelId = (channelId: string): Thenable<void> => {
    this.lastChannelId = channelId;
    return this.context.globalState.update(
      stateKeys.LAST_CHANNEL_ID,
      channelId
    );
  };

  updateCurrentUser = (userInfo: CurrentUser): Thenable<void> => {
    this.currentUserInfo = userInfo;
    return this.context.globalState.update(stateKeys.USER_INFO, userInfo);
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
    const userIds = new Set(
      (<any>Object)
        .values(this.messages[channelId])
        .map(message => message.userId)
    );
    const allIds = new Set(Object.keys(this.users));
    if (!isSuperset(allIds, userIds)) {
      this.fillUpBots(difference(userIds, allIds));
    }

    this.updateAllUI();
  };

  fillUpBots(missingIds: Set<any>): Promise<any> {
    // missingIds are bot ids that we don't have in the store. We will
    // fetch their details, and then update the UI.
    const ids = [...missingIds].filter(id => id.startsWith("B"));
    // This filter for bots is specific to Slack
    return Promise.all(
      ids.map(botId => {
        return this.chatProvider.getBotInfo(botId).then(users => {
          this.users = {
            ...this.users,
            ...users
          };
        });
      })
    ).then(() => {
      return this.updateWebviewUI();
    });
  }

  loadChannelHistory(channelId: string): Promise<void> {
    return this.chatProvider
      .loadChannelHistory(channelId)
      .then(messages => this.updateMessages(channelId, messages))
      .catch(error => console.error(error));
  }

  updateUserPrefs() {
    return this.chatProvider.getUserPrefs().then(response => {
      // We could also save the muted channels to local storage
      this.currentUserPrefs = response;
      this.updateUnreadCount();
    });
  }

  getLastTimestamp(): string {
    const id = this.lastChannelId;
    const channelMessages = id in this.messages ? this.messages[id] : {};
    const timestamps = Object.keys(channelMessages).map(tsString => +tsString);

    if (timestamps.length > 0) {
      return Math.max(...timestamps).toString();
    }
  }

  updateReadMarker(): void {
    const channelId = this.lastChannelId;
    const channel = this.getChannel(channelId);
    const lastTs = this.getLastTimestamp();

    if (channel && lastTs) {
      const { readTimestamp } = channel;
      const hasNewerMsgs = +readTimestamp < +lastTs;

      if (!readTimestamp || hasNewerMsgs) {
        const channel = this.getChannel(channelId);
        const incremented = (+lastTs + 1).toString(); // Slack API workaround
        this.chatProvider.markChannel(channel, incremented).then(channel => {
          this.updateChannel(channel);
          this.updateAllUI();
        });
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

  fetchThreadReplies(parentTimestamp: string) {
    // Assume this is the current channel
    const currentChannelId = this.lastChannelId;
    return this.chatProvider
      .fetchThreadReplies(currentChannelId, parentTimestamp)
      .then(message => {
        let messages = {};
        messages[parentTimestamp] = message;
        this.updateMessages(currentChannelId, messages);
      });
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
      newMessages[parentTimestamp] = {
        ...message,
        replies: [...message.replies, reply]
      };
      this.updateMessages(channelId, newMessages);
    }
  }
}
