import * as vscode from "vscode";
import { SelfCommands } from "../constants";
import ConfigHelper from "../config";
import SlackAPIClient from "./client";
import SlackMessenger from "./messenger";
import {
  IChatProvider,
  User,
  Channel,
  Users,
  Message,
  ChannelMessages,
  UserPreferences,
  CurrentUser
} from "../types";

const stripLinkSymbols = (text: string): string => {
  // To send out live share links and render them correctly,
  // we append </> to the link text. However, this is not
  // handled by normal Slack clients, and should be removed before
  // we actually send the message via the RTM API

  // This is hacky, and we will need a better solution - perhaps
  // we could make all rendering manipulations on the extension side
  // before sending the message to Vuejs for rendering
  if (text.startsWith("<") && text.endsWith(">")) {
    return text.substr(1, text.length - 2);
  } else {
    return text;
  }
};

export class SlackChatProvider implements IChatProvider {
  private token: string;
  private client: SlackAPIClient;
  private messenger: SlackMessenger;

  async getToken(currentTeamId: string): Promise<string> {
    this.token = await ConfigHelper.getToken("slack", currentTeamId);

    if (!this.token) {
      this.token = await ConfigHelper.getToken("slack");

      // Migration for 0.7.4: the token might be inside `slack`
      await ConfigHelper.setToken(this.token, "slack", currentTeamId);
      await ConfigHelper.clearToken("slack");
    }

    this.client = new SlackAPIClient(this.token);
    return this.token;
  }

  async signout(userInfo: CurrentUser): Promise<void> {
    const teamIds = userInfo.teams.map(({ id }) => id);
    const promises = teamIds.map(teamId =>
      ConfigHelper.clearToken("slack", teamId)
    );
    await Promise.all(promises);
  }

  validateToken(token: string): Promise<CurrentUser> {
    // This is creating a new client, since getToken from keychain
    // is not called before validation
    const client = new SlackAPIClient(token);
    return client.authTest();
  }

  connect(): Promise<CurrentUser> {
    this.messenger = new SlackMessenger(this.token);
    return this.messenger.start();
  }

  isConnected(): boolean {
    return !!this.messenger && this.messenger.isConnected();
  }

  subscribePresence(users: Users) {
    return this.messenger.subscribePresence(users);
  }

  createIMChannel(user: User): Promise<Channel> {
    return this.client.openIMChannel(user);
  }

  fetchUsers(): Promise<Users> {
    return this.client.getUsers();
  }

  fetchChannels(users: Users): Promise<Channel[]> {
    // users argument is required to associate IM channels
    // with users
    return this.client.getChannels(users);
  }

  fetchUserInfo(userId: string): Promise<User> {
    // Works for bots only, since workspace users are fetched already
    if (userId.startsWith("B")) {
      return this.client.getBotInfo(userId);
    } else {
      return this.client.getUserInfo(userId);
    }
  }

  loadChannelHistory(channelId: string): Promise<ChannelMessages> {
    return this.client.getConversationHistory(channelId);
  }

  getUserPrefs(): Promise<UserPreferences> {
    return this.client.getUserPrefs();
  }

  async markChannel(channel: Channel, timestamp: string): Promise<Channel> {
    let response = await this.client.markChannel({ channel, ts: timestamp });
    const { ok } = response;

    if (ok) {
      return {
        ...channel,
        readTimestamp: timestamp,
        unreadCount: 0
      };
    }
  }

  fetchThreadReplies(channelId: string, timestamp: string): Promise<Message> {
    return this.client.getReplies(channelId, timestamp);
  }

  fetchChannelInfo(channel: Channel): Promise<Channel> {
    return this.client.getChannelInfo(channel);
  }

  sendThreadReply(
    text: string,
    currentUserId: string,
    channelId: string,
    parentTimestamp: string
  ) {
    const cleanText = stripLinkSymbols(text);
    return this.client.sendMessage({
      channel: channelId,
      text: cleanText,
      thread_ts: parentTimestamp
    });
  }

  async sendMessage(text: string, currentUserId: string, channelId: string) {
    const cleanText = stripLinkSymbols(text);

    try {
      const result = await this.messenger.sendMessage({
        channel: channelId,
        text: cleanText
      });

      // TODO: this is not the correct timestamp to attach, since the
      // API might get delayed, because of network issues
      let newMessages: ChannelMessages = {};
      newMessages[result.ts] = {
        userId: currentUserId,
        timestamp: result.ts,
        text,
        content: null,
        reactions: [],
        replies: {}
      };

      vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
        channelId,
        messages: newMessages
      });
    } catch (error) {
      return console.error(error);
    }
  }

  destroy(): Promise<void> {
    if (!!this.messenger) {
      this.messenger.disconnect();
    }

    return Promise.resolve();
  }
}
