import * as vscode from "vscode";
import SlackAPIClient from "../client";
import {
  SlackChannel,
  SlackCurrentUser,
  SlackChannelMessages,
  SlackMessages,
  SlackUsers,
  IStore,
  UiMessage
} from "../interfaces";
import StatusItem from "../status";
import ConfigHelper from "../configuration";

const stateKeys = {
  LAST_CHANNEL: "lastChannel", // TODO: deprecate this
  LAST_CHANNEL_ID: "lastChannelId",
  CHANNELS: "channels",
  USER_INFO: "userInfo",
  USERS: "users"
};

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

export default class Store implements IStore {
  slackToken: string;
  lastChannelId: string;
  channels: SlackChannel[];
  currentUserInfo: SlackCurrentUser;
  users: SlackUsers;
  messages: SlackMessages = {};
  uiCallback: (message: UiMessage) => void;

  statusItem: StatusItem;

  constructor(private context: vscode.ExtensionContext) {
    // Load token first
    this.slackToken = ConfigHelper.getToken();

    // Now load global state
    const { globalState } = context;
    this.channels = globalState.get(stateKeys.CHANNELS);
    this.currentUserInfo = globalState.get(stateKeys.USER_INFO);
    this.users = globalState.get(stateKeys.USERS);
    this.lastChannelId = globalState.get(stateKeys.LAST_CHANNEL_ID);
    const lastChannel: SlackChannel = globalState.get(stateKeys.LAST_CHANNEL);

    if (lastChannel && !this.lastChannelId) {
      // We have old state lying around, which we will clean up now
      this.lastChannelId = !!lastChannel.id ? lastChannel.id : null;
      globalState.update(stateKeys.LAST_CHANNEL, null);
    }

    if (this.currentUserInfo && this.slackToken) {
      if (this.currentUserInfo.token !== this.slackToken) {
        // Token has changed, all state is suspicious now
        this.lastChannelId = null;
        this.channels = null;
        this.currentUserInfo = null;
        this.users = null;
      }
    }

    // Status bar item
    this.statusItem = new StatusItem();
  }

  dispose() {
    this.statusItem.dispose();
  }

  setUiCallback(uiCallback) {
    this.uiCallback = uiCallback;
  }

  getChannel(channelId: string): SlackChannel {
    return this.channels.find(channel => channel.id === channelId);
  }

  updateUi() {
    const channel = this.getChannel(this.lastChannelId);
    let name = "";

    if (channel) {
      name = channel.name;
    }

    const messages =
      this.lastChannelId in this.messages
        ? this.messages[this.lastChannelId]
        : {};

    this.uiCallback({
      messages,
      users: this.users,
      currentUser: this.currentUserInfo,
      channelName: name,
      statusText: ""
    });
  }

  getUnreadCount(channel: SlackChannel): number {
    const { id, readTimestamp } = channel;
    const messages = id in this.messages ? this.messages[id] : {};
    return Object.keys(messages).filter(ts => {
      const isSomeotherUser = messages[ts].userId !== this.currentUserInfo.id;
      const isNewTimestamp = !!readTimestamp ? +ts > +readTimestamp : false;
      return isSomeotherUser && isNewTimestamp;
    }).length;
  }

  updateUnreadCount() {
    const unreads = this.channels.map(channel => this.getUnreadCount(channel));
    const totalUnreads = unreads.reduce((a, b) => a + b, 0);
    this.statusItem.updateCount(totalUnreads);
  }

  updateUsers = users => {
    this.users = users;
    this.context.globalState.update(stateKeys.USERS, users);
  };

  updateChannels = channels => {
    this.channels = channels.map(channel => {
      const localChannel = this.channels.find(c => c.id === channel.id);
      return !!localChannel
        ? { readTimestamp: localChannel.readTimestamp, ...channel }
        : { ...channel };
    });
    this.context.globalState.update(stateKeys.CHANNELS, channels);
  };

  fetchUsers = (): Promise<SlackUsers> => {
    const client = new SlackAPIClient(this.slackToken);
    return client.getAllUsers().then(users => {
      this.updateUsers(users);
      return users;
    });
  };

  fetchChannels = (): Promise<SlackChannel[]> => {
    const client = new SlackAPIClient(this.slackToken);
    let usersPromise: Promise<SlackUsers>;

    if (this.users) {
      usersPromise = new Promise((resolve, _) => resolve(this.users));
    } else {
      usersPromise = this.fetchUsers();
    }

    return usersPromise
      .then(users => client.getChannels(users))
      .then(channels => {
        this.updateChannels(channels);
        return channels;
      });
  };

  updateLastChannel = (channel: SlackChannel): Thenable<void> => {
    this.lastChannelId = channel.id;
    return this.context.globalState.update(
      stateKeys.LAST_CHANNEL_ID,
      channel.id
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

    this.updateUi();
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
        return this.updateUi();
      })
      .catch(error => console.error(error));
  }

  loadChannelHistory(): Promise<void> {
    const client = new SlackAPIClient(this.slackToken);
    return client
      .getConversationHistory(this.lastChannelId)
      .then(messages => {
        this.updateMessages(this.lastChannelId, messages);
      })
      .catch(error => {
        console.error(error);
      });
  }

  getLastTimestamp(): string {
    const id = this.lastChannelId;
    const channelMessages = id in this.messages ? this.messages[id] : {};
    const timestamps = Object.keys(channelMessages)
      .filter(
        tsKey => channelMessages[tsKey].userId !== this.currentUserInfo.id
      )
      .map(tsString => +tsString);

    if (timestamps.length > 0) {
      return Math.max(...timestamps).toString();
    }
  }

  updateReadMarker(): void {
    const channel = this.getChannel(this.lastChannelId);
    const lastTs = this.getLastTimestamp();

    if (channel && lastTs && channel.readTimestamp !== lastTs) {
      const client = new SlackAPIClient(this.slackToken);
      const channel = this.getChannel(this.lastChannelId);
      client.markChannel({ channel, ts: lastTs }).then(response => {
        const { ok } = response;
        if (ok) {
          const newChannels = this.channels.map(channel => {
            const { id } = channel;
            if (id === this.lastChannelId) {
              return {
                ...channel,
                readTimestamp: lastTs
              };
            } else {
              return channel;
            }
          });
          this.updateChannels(newChannels);
          this.updateUnreadCount();
        }
      });
    }
  }
}
