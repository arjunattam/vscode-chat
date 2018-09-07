import * as vscode from "vscode";
import * as Discord from "discord.js";
import {
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
  // TODO: save reactions, link unfurling (content)
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
  // TODO: this needs to manage refresh token internally
  token: string;
  currentUser: CurrentUser;
  client: Discord.Client;

  async getToken(): Promise<string> {
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

        // TODO: add switcher for teams
        const currentTeam = teams.find(t => t.name === "arjun-test"); // TODO: handle 0 length
        this.currentUser = {
          id,
          name,
          token: this.token,
          teams,
          currentTeamId: currentTeam.id
        };
        resolve(this.currentUser);
      });

      // this.client.on("debug", info => {
      //   console.log("Discord client log:", info);
      // });

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
    const { currentTeamId } = this.currentUser;
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
          .permissionsFor(this.currentUser.id)
          .has(Discord.Permissions.FLAGS.VIEW_CHANNEL);
      })
      .map(channel => {
        const { name, id, parentID } = channel;
        return {
          id,
          name,
          categoryName: categories[parentID],
          type: ChannelType.channel,
          readTimestamp: ``, // TODO: fix
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
          readTimestamp: ``, // TODO: fix
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
          readTimestamp: ``, // TODO: fix
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
    return Promise.resolve(channel);
  }

  fetchThreadReplies(channelId: string, ts: string): Promise<any> {
    // Never called. Discord has no threads.
    return Promise.resolve();
  }

  createIMChannel(user: User): Promise<any> {
    return Promise.resolve();
  }
}
