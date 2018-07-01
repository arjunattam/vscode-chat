import * as vscode from "vscode";
import SlackAPIClient from "../client";
import {
  SlackChannel,
  SlackCurrentUser,
  SlackMessage,
  SlackUsers,
  IStore,
  UiMessage
} from "../interfaces";

const stateKeys = {
  LAST_CHANNEL: "lastChannel",
  CHANNELS: "channels",
  USER_INFO: "userInfo",
  USERS: "users"
};

export default class Store implements IStore {
  slackToken: string;
  lastChannel: SlackChannel;
  channels: SlackChannel[];
  currentUserInfo: SlackCurrentUser;
  users: SlackUsers;
  messages: SlackMessage[] = []; // of current channel
  uiCallback: (message: UiMessage) => void;

  constructor(private context: vscode.ExtensionContext) {
    // Load token first
    const config = vscode.workspace.getConfiguration("chat");
    const { slack } = config;

    if (slack && slack.legacyToken) {
      this.slackToken = slack.legacyToken;
    } else {
      vscode.window.showErrorMessage("Slack token not found in settings.");
      return;
    }

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
      channelName
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
    this.messages = [];
  };

  updateMessages = (newMessages: SlackMessage[]) => {
    this.messages = []
      .concat(this.messages, newMessages)
      .filter(
        (message, index, self) =>
          index === self.findIndex(t => t.timestamp === message.timestamp)
      );
    this.updateUi();
  };

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
