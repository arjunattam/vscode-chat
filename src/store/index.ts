import * as vscode from "vscode";
import SlackAPIClient from "../client";
import {
  SlackChannel,
  SlackCurrentUser,
  SlackMessages,
  SlackUsers,
  IStore,
  UiMessage
} from "../interfaces";
import ConfigHelper from "../configuration";

const stateKeys = {
  LAST_CHANNEL: "lastChannel",
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
  lastChannel: SlackChannel;
  channels: SlackChannel[];
  currentUserInfo: SlackCurrentUser;
  users: SlackUsers;
  messages: SlackMessages = {}; // of current channel
  uiCallback: (message: UiMessage) => void;

  constructor(private context: vscode.ExtensionContext) {
    // Load token first
    this.slackToken = ConfigHelper.getToken();

    // Now load global state
    const { globalState } = context;
    this.lastChannel = globalState.get(stateKeys.LAST_CHANNEL);
    this.channels = globalState.get(stateKeys.CHANNELS);
    this.currentUserInfo = globalState.get(stateKeys.USER_INFO);
    this.users = globalState.get(stateKeys.USERS);

    if (this.currentUserInfo && this.slackToken) {
      if (this.currentUserInfo.token !== this.slackToken) {
        // Token has changed, all state is suspicious now
        this.lastChannel = null;
        this.channels = null;
        this.currentUserInfo = null;
        this.users = null;
      }
    }
  }

  setUiCallback(uiCallback) {
    this.uiCallback = uiCallback;
  }

  updateUi() {
    const { name, type } = this.lastChannel;
    const prefix = type === "im" ? "@" : "#";
    const channelName = prefix + name;

    this.uiCallback({
      messages: this.messages,
      users: this.users,
      currentUser: this.currentUserInfo,
      channelName,
      statusText: ""
    });
  }

  updateUsers = (): Promise<SlackUsers> => {
    const client = new SlackAPIClient(this.slackToken);
    return client.getAllUsers().then(users => {
      this.users = users;
      this.context.globalState.update(stateKeys.USERS, users);
      return users;
    });
  };

  updateChannels = (): Promise<SlackChannel[]> => {
    const client = new SlackAPIClient(this.slackToken);
    let usersPromise: Promise<SlackUsers>;

    if (this.users) {
      usersPromise = new Promise((resolve, _) => resolve(this.users));
    } else {
      usersPromise = this.updateUsers();
    }

    return usersPromise
      .then(users => client.getChannels(users))
      .then(channels => {
        this.channels = channels;
        this.context.globalState.update(stateKeys.CHANNELS, channels);
        return channels;
      });
  };

  updateLastChannel = (channel: SlackChannel): Thenable<void> => {
    this.lastChannel = channel;
    return this.context.globalState.update(stateKeys.LAST_CHANNEL, channel);
  };

  updateCurrentUser = (userInfo: SlackCurrentUser): Thenable<void> => {
    this.currentUserInfo = userInfo;
    return this.context.globalState.update(stateKeys.USER_INFO, userInfo);
  };

  clearMessages = () => {
    this.messages = {};
  };

  updateMessages = (newMessages: SlackMessages) => {
    this.messages = {
      ...this.messages,
      ...newMessages
    };

    // Remove undefined, after message deleted
    Object.keys(this.messages).forEach(key => {
      if (typeof this.messages[key] === "undefined") {
        delete this.messages[key];
      }
    });

    // Check if we have all users. Since there is not bots.list API
    // method, it is possible that a bot user is not in our store
    const userIds = new Set(
      (<any>Object).values(this.messages).map(message => message.userId)
    );
    const allIds = new Set(Object.keys(this.users));
    if (!isSuperset(allIds, userIds)) {
      this.fillUpBots(difference(userIds, allIds));
    }

    this.updateUi();
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
      .getConversationHistory(this.lastChannel.id)
      .then(messages => {
        this.updateMessages(messages);
      })
      .catch(error => {
        console.error(error);
      });
  }
}
