import * as vscode from "vscode";
import * as Discord from "discord.js";
import {
  IStore,
  IChatProvider,
  CurrentUser,
  UserPreferences,
  User,
  Users,
  Channel,
  ChannelType,
  ChannelMessages,
  Message
} from "../interfaces";
import ConfigHelper from "../config";
import { SelfCommands } from "../constants";

const HISTORY_LIMIT = 50;

const getMessage = (raw: Discord.Message): Message => {
  const { author, createdTimestamp, content } = raw;
  // TODO: Handle reactions, link unfurling (content), attachments, edits
  const timestamp = (createdTimestamp / 1000).toString();
  return {
    timestamp,
    userId: author.id,
    text: content,
    content: undefined,
    reactions: [],
    replies: []
  };
};

const DEFAULT_AVATARS = [
  "https://discordapp.com/assets/dd4dbc0016779df1378e7812eabaa04d.png",
  "https://discordapp.com/assets/0e291f67c9274a1abdddeb3fd919cbaa.png",
  "https://discordapp.com/assets/6debd47ed13483642cf09e832ed0bc1b.png",
  "https://discordapp.com/assets/322c936a8c8be1b803cd94861bdfa868.png",
  "https://discordapp.com/assets/1cbd08c76f8af6dddce02c5138971129.png"
];

const getAvatarUrl = (userId, avatar, size) => {
  if (!avatar) {
    return DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
  } else {
    // size can be any power of two between 16 and 2048
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=${size}`;
  }
};

const getImageUrl = (userId, avatar) => getAvatarUrl(userId, avatar, 128);

const getSmallImageUrl = (userId, avatar) => getAvatarUrl(userId, avatar, 32);

export class DiscordChatProvider implements IChatProvider {
  token: string;
  client: Discord.Client;

  constructor(private store: IStore) {}

  async getToken(): Promise<string> {
    // When this starts using OAuth, we need to manage refresh tokens here
    this.token = await ConfigHelper.getToken("discord");
    return Promise.resolve(this.token);
  }

  connect(): Promise<CurrentUser> {
    this.client = new Discord.Client();

    return new Promise(resolve => {
      this.client.on("ready", () => {
        const { id, username: name } = this.client.user;
        const teams = this.client.guilds.array().map(guild => ({
          id: guild.id,
          name: guild.name
        }));

        const currentUser = {
          id,
          name,
          token: this.token,
          teams,
          currentTeamId: undefined
        };
        resolve(currentUser);
      });

      if (process.env.IS_DEBUG === "true") {
        // Debug logs for local testing
        this.client.on("debug", info =>
          console.log("Discord client log:", info)
        );
      }

      this.client.on("presenceUpdate", (_, newMember: Discord.GuildMember) => {
        const { id: userId, presence } = newMember;
        const isOnline = presence.status === "online";
        vscode.commands.executeCommand(SelfCommands.UPDATE_USER_PRESENCE, {
          userId,
          isOnline
        });
      });

      this.client.on("message", msg => {
        // If message has guild, we check for current guild
        // Else, message is from a DM or group DM
        const currentGuild = this.getCurrentGuild();
        const { guild } = msg;

        if (!guild || guild.id === currentGuild.id) {
          let newMessages: ChannelMessages = {};
          const channelId = msg.channel.id;
          const parsed = getMessage(msg);
          const { timestamp } = parsed;
          newMessages[timestamp] = parsed;
          vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
            channelId,
            messages: newMessages
          });

          // Handle links separately (for vsls invites)
          let uri: vscode.Uri | undefined;
          try {
            uri = vscode.Uri.parse(parsed.text);
            vscode.commands.executeCommand(SelfCommands.HANDLE_INCOMING_LINKS, {
              senderId: parsed.userId,
              uri
            });
          } catch (e) {}
        }
      });

      this.client.login(this.token);
    });
  }

  isConnected(): boolean {
    return !!this.client && !!this.client.readyTimestamp;
  }

  getUserPrefs(): Promise<UserPreferences> {
    return Promise.resolve({});
  }

  getCurrentGuild(): Discord.Guild {
    const { currentTeamId } = this.store.currentUserInfo;
    return this.client.guilds.find(guild => guild.id === currentTeamId);
  }

  fetchUsers(): Promise<Users> {
    const guild = this.getCurrentGuild();
    // TODO: save users for DMs and group DMs

    return guild.fetchMembers().then(response => {
      let users: Users = {};
      response.members.forEach(member => {
        const { id, displayName, presence, user } = member;
        const { avatar, id: userId } = user;
        users[id] = {
          id,
          name: displayName,
          fullName: displayName,
          imageUrl: getImageUrl(userId, avatar),
          smallImageUrl: getSmallImageUrl(userId, avatar),
          isOnline: presence.status === "online"
        };
      });

      return users;
    });
  }

  fetchChannels(users: Users): Promise<Channel[]> {
    // This fetches channels of the current guild, and (group) DMs
    // for the client.
    // For unreads, we are not retrieving historical unreads, not clear if API supports.
    const readyTimestamp = (this.client.readyTimestamp / 1000.0).toString();
    const guild = this.getCurrentGuild();
    let categories = {};
    guild.channels
      .filter(channel => channel.type === "category")
      .forEach(channel => {
        const { id, name } = channel;
        categories[id] = name;
      });

    const guildChannels: Channel[] = guild.channels
      .filter(channel => channel.type !== "category")
      .filter(channel => {
        // Filter allowed channels
        return channel
          .permissionsFor(this.store.currentUserInfo.id)
          .has(Discord.Permissions.FLAGS.VIEW_CHANNEL);
      })
      .map(channel => {
        const { name, id, parentID } = channel;
        return {
          id,
          name,
          categoryName: categories[parentID],
          type: ChannelType.channel,
          readTimestamp: readyTimestamp,
          unreadCount: 0
        };
      });

    const imChannels = this.client.channels
      .filter(channel => channel.type === "dm")
      .map((channel: Discord.DMChannel) => {
        const { id, recipient } = channel;
        return {
          id,
          name: recipient.username,
          type: ChannelType.im,
          readTimestamp: readyTimestamp,
          unreadCount: 0
        };
      });

    const groupChannels = this.client.channels
      .filter(channel => channel.type === "group")
      .map((channel: Discord.GroupDMChannel) => {
        const { id, recipients } = channel;
        return {
          id,
          name: recipients.map(recipient => recipient.username).join(", "),
          type: ChannelType.group,
          readTimestamp: readyTimestamp,
          unreadCount: 0
        };
      });

    return Promise.resolve([...guildChannels, ...imChannels, ...groupChannels]);
  }

  loadChannelHistory(channelId: string): Promise<ChannelMessages> {
    const channel: any = this.client.channels.find(
      channel => channel.id === channelId
    );
    return channel
      .fetchMessages({ limit: HISTORY_LIMIT })
      .then((messages: Discord.Message[]) => {
        let result: ChannelMessages = {};
        messages.forEach(message => {
          const parsed = getMessage(message);
          const { timestamp } = parsed;
          result[timestamp] = parsed;
        });
        return result;
      });
  }

  sendMessage(
    text: string,
    currentUserId: string,
    channelId: string
  ): Promise<void> {
    const channel: any = this.client.channels.find(
      channel => channel.id === channelId
    );
    return channel.send(text);
  }

  fetchChannelInfo(channel: Channel): Promise<Channel> {
    return Promise.resolve(channel);
  }

  subscribePresence(usersUsers): void {}

  getBotInfo(botId: string): Promise<Users> {
    return Promise.resolve({});
  }

  markChannel(channel: Channel, ts: string): Promise<Channel> {
    // Discord does not have a concept of timestamp, it will acknowledge everything
    // return Promise.resolve(channel);
    const { id: channelId } = channel;
    const discordChannel: any = this.client.channels.find(
      channel => channel.id === channelId
    );
    return discordChannel
      .acknowledge()
      .then(() => ({ ...channel, readTimestamp: ts }));
  }

  fetchThreadReplies(channelId: string, ts: string): Promise<any> {
    // Never called. Discord has no threads.
    return Promise.resolve();
  }

  createIMChannel(user: User): Promise<any> {
    // TODO: this is required for live share
    return Promise.resolve();
  }
}
