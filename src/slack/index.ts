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
} from "../interfaces";

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

  async getToken(): Promise<string> {
    this.token = await ConfigHelper.getToken();
    this.client = new SlackAPIClient(this.token);
    return this.token;
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

  getBotInfo(botId: string): Promise<Users> {
    return this.client.getBotInfo(botId);
  }

  loadChannelHistory(channelId: string): Promise<ChannelMessages> {
    return this.client.getConversationHistory(channelId);
  }

  getUserPrefs(): Promise<UserPreferences> {
    return this.client.getUserPrefs();
  }

  markChannel(channel: Channel, timestamp: string): Promise<Channel> {
    return this.client
      .markChannel({ channel, ts: timestamp })
      .then(response => {
        const { ok } = response;
        if (ok) {
          return {
            ...channel,
            readTimestamp: timestamp,
            unreadCount: 0
          };
        }
      });
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

  sendMessage(text: string, currentUserId: string, channelId: string) {
    // The rtm gives an error while sending messages. Might be related to
    // https://github.com/slackapi/node-slack-sdk/issues/527
    // https://github.com/slackapi/node-slack-sdk/issues/550
    //
    // So we use the webclient instead of
    // this.rtmClient.sendMessage(cleanText, id)
    const cleanText = stripLinkSymbols(text);
    return this.client
      .sendMessage({
        channel: channelId,
        text: cleanText,
        thread_ts: undefined
      })
      .then((result: any) => {
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
      })
      .catch(error => console.error(error));
  }
}
