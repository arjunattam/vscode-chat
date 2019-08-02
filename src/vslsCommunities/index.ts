import * as vscode from "vscode";
import * as gravatar from "gravatar-api";
import { VSLS_COMMUNITIES_EXTENSION_ID, SelfCommands } from "../constants";
import { getExtension } from "../utils";

interface IMessage {
  type: string;
  content: string;
  timestamp: string;
  sender: string;
}

const toMessage = (msg: IMessage) => ({
  timestamp: (Date.parse(msg.timestamp) / 1000.0).toString(),
  userId: msg.sender,
  text: msg.content,
  content: undefined,
  reactions: [],
  replies: {}
});

export class VslsCommunitiesProvider implements IChatProvider {
  isWSConnected: boolean = false;

  async connect(): Promise<CurrentUser | undefined> {
    // Waiting for the extension to get activated
    setTimeout(() => {
      const extension = getExtension(VSLS_COMMUNITIES_EXTENSION_ID);

      if (extension) {
        const exports = extension.exports;
        exports.setMessageCallback((data: any) => {
          this.onNewMessage(data);
        });

        this.isWSConnected = true;
      }
    }, 5000);

    return;
  }

  onNewMessage(data: any) {
    const { name, messages } = data;
    const chatMessages: Message[] = messages.map(toMessage);
    let channelMessages: ChannelMessages = {};
    chatMessages.forEach(msg => {
      channelMessages[msg.timestamp] = msg;
    });
    vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
      channelId: name,
      messages: channelMessages,
      provider: "vslsCommunities"
    });
  }

  isConnected(): boolean {
    return this.isWSConnected;
  }

  async sendMessage(text: string, currentUserId: string, channelId: string) {
    const api = getExtension(VSLS_COMMUNITIES_EXTENSION_ID)!.exports;
    api.sendMessage(channelId, text);
  }

  fetchUsers(): Promise<Users> {
    const api = getExtension(VSLS_COMMUNITIES_EXTENSION_ID)!.exports;
    const users: User[] = api.getUsers().map(({ name, email }: any) => {
      const avatar = gravatar.imageUrl({
        email,
        parameters: { size: "200", d: "retro" },
        secure: true
      });
      return {
        id: email,
        name,
        email,
        fullName: name,
        imageUrl: avatar,
        smallImageUrl: avatar,
        presence: UserPresence.available
      };
    });
    let usersToSend: Users = {};
    users.forEach(u => {
      usersToSend[u.id] = u;
    });
    return Promise.resolve(usersToSend);
  }

  fetchChannels(users: Users): Promise<Channel[]> {
    // TODO: when a new community is added, how will team chat know?
    const api = getExtension(VSLS_COMMUNITIES_EXTENSION_ID)!.exports;
    const communities = api.getCommunities();
    const channels: Channel[] = communities.map((name: string) => ({
      id: name,
      name,
      type: ChannelType.channel,
      readTimestamp: undefined,
      unreadCount: 0
    }));
    return Promise.resolve(channels);
  }

  async loadChannelHistory(channelId: string) {
    const api = getExtension(VSLS_COMMUNITIES_EXTENSION_ID)!.exports;
    const messages: IMessage[] = await api.getChannelHistory(channelId);
    const chatMessages: Message[] = messages.map(toMessage);
    let channelMessages: ChannelMessages = {}
    chatMessages.forEach(msg => {
      channelMessages[msg.timestamp] = msg;
    })
    return channelMessages;
  }

  subscribePresence(users: Users) {}

  getUserPreferences(): Promise<UserPreferences> {
    return Promise.resolve({});
  }

  async validateToken(): Promise<CurrentUser | undefined> {
    return;
  }

  async fetchUserInfo(userId: string): Promise<User | undefined> {
    return undefined;
  }

  async fetchChannelInfo(channel: Channel): Promise<Channel | undefined> {
    return undefined;
  }

  async markChannel(
    channel: Channel,
    ts: string
  ): Promise<Channel | undefined> {
    return undefined;
  }

  async fetchThreadReplies(
    channelId: string,
    ts: string
  ): Promise<Message | undefined> {
    return undefined;
  }

  async sendThreadReply(
    text: string,
    currentUserId: string,
    channelId: string,
    parentTimestamp: string
  ) {}

  async updateSelfPresence(presence: UserPresence, durationInMinutes: number) {
    return undefined;
  }

  async createIMChannel(user: User): Promise<Channel | undefined> {
    return undefined;
  }

  async destroy() {}
}
