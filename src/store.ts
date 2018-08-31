import * as vscode from "vscode";
import * as semver from "semver";
import SlackAPIClient from "./client";
import {
  SlackChannel,
  SlackCurrentUser,
  SlackChannelMessages,
  SlackMessages,
  SlackUsers,
  IStore,
  UIMessage,
  SlackUser,
  ChannelType
} from "./interfaces";
import StatusItem from "./status";
import ConfigHelper from "./config";
import Logger from "./logger";
import { getExtensionVersion } from "./utils";

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
  slackToken: string;
  installationId: string;
  lastChannelId: string;
  channels: SlackChannel[] = [];
  channelsFetchedAt: Date;
  currentUserInfo: SlackCurrentUser;
  users: SlackUsers = {};
  usersFetchedAt: Date;
  messages: SlackMessages = {};

  // We could merge these 3 store subscribers with one protocol
  uiCallback: (message: UIMessage) => void;
  treeCallbacks: (() => void)[] = [];
  statusItem: StatusItem;

  constructor(private context: vscode.ExtensionContext) {
    const { globalState } = context;
    this.channels = globalState.get(stateKeys.CHANNELS);
    this.currentUserInfo = globalState.get(stateKeys.USER_INFO);
    this.users = globalState.get(stateKeys.USERS);
    this.lastChannelId = globalState.get(stateKeys.LAST_CHANNEL_ID);
    this.installationId = globalState.get(stateKeys.INSTALLATION_ID);

    if (this.currentUserInfo && this.slackToken) {
      if (this.currentUserInfo.token !== this.slackToken) {
        // Token has changed, all state is suspicious now
        this.clear();
      }
    }

    this.statusItem = new StatusItem();

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
    const token = await ConfigHelper.getToken();
    this.slackToken = token;
  };

  generateInstallationId() {
    const uuidStr = uuidv4();
    const { globalState } = this.context;
    globalState.update(stateKeys.INSTALLATION_ID, uuidStr);
    this.installationId = uuidStr;
  }

  clear() {
    this.updateLastChannelId(null);
    this.updateChannels([]);
    this.updateCurrentUser(null);
    this.updateUsers({});

    this.usersFetchedAt = null;
    this.channelsFetchedAt = null;
    this.messages = {};
  }

  updateAllUI() {
    this.updateUnreadCount();
    this.updateTreeViews();
    this.updateWebviewUI();
  }

  reset() {
    this.clear();
    ConfigHelper.getToken().then(token => {
      this.slackToken = token;
      this.updateAllUI();
    });
  }

  dispose() {
    this.statusItem.dispose();
  }

  isAuthenticated() {
    return this.currentUserInfo && !!this.currentUserInfo.id;
  }

  setUiCallback(uiCallback) {
    this.uiCallback = uiCallback;
  }

  setTreeCallback(treeCallback) {
    this.treeCallbacks.push(treeCallback);
  }

  getChannel(channelId: string): SlackChannel {
    return this.channels.find(channel => channel.id === channelId);
  }

  getChannelLabels() {
    return this.channels.map(channel => {
      const unread = this.getUnreadCount(channel);
      const { name, type } = channel;
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

      let icon;
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

      return {
        ...channel,
        unread,
        icon,
        label: `${name} ${unread > 0 ? `(${unread} new)` : ""}`,
        isOnline
      };
    });
  }

  getIMChannel(user: SlackUser): SlackChannel | undefined {
    return this.channels.find(channel => channel.name === `@${user.name}`);
  }

  createIMChannel(user: SlackUser): Promise<SlackChannel> {
    const client = new SlackAPIClient(this.slackToken);
    return client.openIMChannel(user).then(channel => {
      this.updateChannel(channel);
      return channel;
    });
  }

  updateWebviewUI() {
    const channel = this.getChannel(this.lastChannelId);
    const channelName = !!channel ? channel.name : "";
    const messages =
      this.lastChannelId in this.messages
        ? this.messages[this.lastChannelId]
        : {};

    if (!!this.uiCallback) {
      this.uiCallback({
        messages,
        users: this.users,
        currentUser: this.currentUserInfo,
        channelName,
        statusText: ""
      });
    }
  }

  getUnreadCount(channel: SlackChannel): number {
    const { id, readTimestamp, unreadCount } = channel;
    const messages = id in this.messages ? this.messages[id] : {};
    const unreadMessages = Object.keys(messages).filter(ts => {
      const isSomeotherUser = messages[ts].userId !== this.currentUserInfo.id;
      const isNewTimestamp = !!readTimestamp ? +ts > +readTimestamp : false;
      return isSomeotherUser && isNewTimestamp;
    });
    return unreadCount ? unreadCount : unreadMessages.length;
  }

  updateTreeViews() {
    if (!!this.treeCallbacks) {
      this.treeCallbacks.forEach(callable => callable());
    }
  }

  updateUnreadCount() {
    const unreads = this.channels.map(channel => this.getUnreadCount(channel));
    const totalUnreads = unreads.reduce((a, b) => a + b, 0);
    this.statusItem.updateCount(totalUnreads);
    this.updateTreeViews();
  }

  updateUserPresence = (userId, isOnline) => {
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
    const now = new Date();
    this.usersFetchedAt = now;
  };

  updateChannelsFetchedAt = () => {
    const now = new Date();
    this.channelsFetchedAt = now;
  };

  updateChannels = channels => {
    this.channels = channels;
    this.context.globalState.update(stateKeys.CHANNELS, channels);
  };

  updateChannel = (newChannel: SlackChannel) => {
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

  fetchUsers = (): Promise<SlackUsers> => {
    const client = new SlackAPIClient(this.slackToken);
    return client.getUsers().then((users: SlackUsers) => {
      // Update users for their presence status, if already known
      let usersWithPresence: SlackUsers = {};

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

  fetchChannels = (): Promise<SlackChannel[]> => {
    const client = new SlackAPIClient(this.slackToken);
    return client.getChannels(this.users).then(channels => {
      this.updateChannels(channels);
      this.updateChannelsFetchedAt();
      this.updateTreeViews();

      const promises = channels.map(channel =>
        client.getChannelInfo(channel).then((newChannel: SlackChannel) => {
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

  getUsersPromise(): Promise<SlackUsers> {
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

  getChannelsPromise(): Promise<SlackChannel[]> {
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

  updateCurrentUser = (userInfo: SlackCurrentUser): Thenable<void> => {
    this.currentUserInfo = userInfo;
    return this.context.globalState.update(stateKeys.USER_INFO, userInfo);
  };

  updateMessages = (channelId: string, newMessages: SlackChannelMessages) => {
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

    this.updateWebviewUI();
    this.updateUnreadCount();
  };

  fillUpBots(missingIds: Set<any>): Promise<any> {
    // missingIds are bot ids that we don't have in the store. We will
    // fetch their details, and then update the UI.
    // We could remove this once we use rtm.start instead of rtm.connect
    const client = new SlackAPIClient(this.slackToken);
    const ids = [...missingIds].filter(id => id.startsWith("B"));
    return Promise.all(
      ids.map(botId => {
        return client.getBotInfo(botId).then(users => {
          this.users = {
            ...this.users,
            ...users
          };
        });
      })
    )
      .then(() => {
        return this.updateWebviewUI();
      })
      .catch(error => console.error(error));
  }

  loadChannelHistory(channelId: string): Promise<void> {
    const client = new SlackAPIClient(this.slackToken);
    return client
      .getConversationHistory(channelId)
      .then(messages => this.updateMessages(channelId, messages))
      .catch(error => console.error(error));
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
        const client = new SlackAPIClient(this.slackToken);
        const channel = this.getChannel(channelId);
        const incremented = (+lastTs + 1).toString(); // Slack API workaround
        client.markChannel({ channel, ts: incremented }).then(response => {
          const { ok } = response;

          if (ok) {
            this.updateChannel({
              ...channel,
              readTimestamp: incremented,
              unreadCount: 0
            });
          }

          this.updateUnreadCount();
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
}
