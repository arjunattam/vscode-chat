import * as vscode from "vscode";
import SlackAPIClient from "../client";
import {
  SlackChannel,
  SlackCurrentUser,
  SlackUsers,
  SlackStore
} from "./interfaces";

const stateKeys = {
  LAST_CHANNEL: "lastChannel",
  CHANNELS: "channels",
  USER_INFO: "userInfo",
  USERS: "users"
};

/**
 * Stores state around users, channels, messages.
 */
export default class Store implements SlackStore {
  slackToken: string;
  lastChannel: SlackChannel;
  channels: SlackChannel[];
  currentUserInfo: SlackCurrentUser;
  users: SlackUsers;

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
    return client.getChannels(this.users).then(channels => {
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
}
