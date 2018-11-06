import * as vscode from "vscode";
import { SelfCommands } from "../constants";
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
  private client: SlackAPIClient;
  private messenger: SlackMessenger;

  constructor(private token: string) {
    this.client = new SlackAPIClient(this.token);
    this.messenger = new SlackMessenger(this.token);
  }

  validateToken(): Promise<CurrentUser | undefined> {
    // This is creating a new client, since getToken from keychain
    // is not called before validation
    return this.client.authTest();
  }

  connect(): Promise<CurrentUser> {
    return this.messenger.start();
  }

  isConnected(): boolean {
    return !!this.messenger && this.messenger.isConnected();
  }

  subscribePresence(users: Users) {
    return this.messenger.subscribePresence(users);
  }

  createIMChannel(user: User): Promise<Channel | undefined> {
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

  fetchUserInfo(userId: string): Promise<User | undefined> {
    if (userId.startsWith("B")) {
      return this.client.getBotInfo(userId);
    } else {
      return this.client.getUserInfo(userId);
    }
  }

  loadChannelHistory(channelId: string): Promise<ChannelMessages> {
    return this.client.getConversationHistory(channelId);
  }

  getUserPreferences(): Promise<UserPreferences | undefined> {
    return this.client.getUserPrefs();
  }

  markChannel(
    channel: Channel,
    timestamp: string
  ): Promise<Channel | undefined> {
    return this.client.markChannel(channel, timestamp);
  }

  fetchThreadReplies(
    channelId: string,
    timestamp: string
  ): Promise<Message | undefined> {
    return this.client.getReplies(channelId, timestamp);
  }

  fetchChannelInfo(channel: Channel): Promise<Channel | undefined> {
    return this.client.getChannelInfo(channel);
  }

  sendThreadReply(
    text: string,
    currentUserId: string,
    channelId: string,
    parentTimestamp: string
  ) {
    const cleanText = stripLinkSymbols(text);
    return this.client.sendMessage(channelId, cleanText, parentTimestamp);
  }

  async sendMessage(text: string, currentUserId: string, channelId: string) {
    const cleanText = stripLinkSymbols(text);

    try {
      const result = await this.messenger.sendMessage(channelId, cleanText);

      // TODO: this is not the correct timestamp to attach, since the
      // API might get delayed, because of network issues
      let newMessages: ChannelMessages = {};
      newMessages[result.ts] = {
        userId: currentUserId,
        timestamp: result.ts,
        text,
        content: undefined,
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
