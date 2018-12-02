import * as vscode from "vscode";
import * as Discord from "discord.js";
import * as rp from "request-promise-native";
import { SelfCommands } from "../constants";
import { toTitleCase } from "../utils";
import Logger from "../logger";

const HISTORY_LIMIT = 50;
const MEMBER_LIMIT = 500;

const getPresence = (presence: Discord.Presence): UserPresence => {
  const { status } = presence;

  switch (status) {
    case "online":
      return UserPresence.available;
    case "dnd":
      return UserPresence.doNotDisturb;
    case "idle":
      return UserPresence.idle;
    case "offline":
      return UserPresence.offline;
  }
};

const getMessageContent = (
  raw: Discord.Message
): MessageContent | undefined => {
  const { embeds } = raw;
  if (!!embeds && embeds.length > 0) {
    const firstEmbed = embeds[0];
    return {
      author: ``,
      pretext: ``,
      title: firstEmbed.title,
      titleLink: firstEmbed.url,
      text: firstEmbed.description,
      footer: ``
    };
  }
};

const getMessage = (raw: Discord.Message): Message => {
  const { author, createdTimestamp, content, reactions, editedTimestamp } = raw;
  const timestamp = (createdTimestamp / 1000).toString();
  return {
    timestamp,
    userId: author.id,
    text: content,
    isEdited: !!editedTimestamp,
    content: getMessageContent(raw),
    replies: {},
    reactions: reactions.map(rxn => ({
      name: rxn.emoji.name,
      count: rxn.count,
      userIds: rxn.users.map(user => user.id)
    }))
  };
};

const getUser = (raw: Discord.User): User => {
  const { id: userId, username, avatar, presence } = raw;
  return {
    id: userId,
    name: username,
    fullName: username,
    imageUrl: getImageUrl(userId, avatar),
    smallImageUrl: getSmallImageUrl(userId, avatar),
    presence: getPresence(presence)
  };
};

const DEFAULT_AVATARS = [
  "https://discordapp.com/assets/dd4dbc0016779df1378e7812eabaa04d.png",
  "https://discordapp.com/assets/0e291f67c9274a1abdddeb3fd919cbaa.png",
  "https://discordapp.com/assets/6debd47ed13483642cf09e832ed0bc1b.png",
  "https://discordapp.com/assets/322c936a8c8be1b803cd94861bdfa868.png",
  "https://discordapp.com/assets/1cbd08c76f8af6dddce02c5138971129.png"
];

const getAvatarUrl = (userId: string, avatar: string, size: number) => {
  if (!avatar) {
    return DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
  } else {
    // size can be any power of two between 16 and 2048
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=${size}`;
  }
};

const getImageUrl = (userId: string, avatar: string) =>
  getAvatarUrl(userId, avatar, 128);

const getSmallImageUrl = (userId: string, avatar: string) =>
  getAvatarUrl(userId, avatar, 32);

export class DiscordChatProvider implements IChatProvider {
  client: Discord.Client;
  mutedChannels: Set<string> = new Set([]);
  imChannels: Channel[] = [];

  constructor(private token: string, private manager: IManager) {
    this.client = new Discord.Client();
  }

  async validateToken(): Promise<CurrentUser | undefined> {
    const response = await rp({
      baseUrl: `https://discordapp.com/api/v6`,
      uri: `/users/@me`,
      json: true,
      headers: {
        Authorization: `${this.token}`
      }
    });
    const { id, username: name } = response;
    return {
      id,
      name,
      teams: [],
      currentTeamId: undefined,
      provider: Providers.discord
    };
  }

  connect(): Promise<CurrentUser> {
    return new Promise(resolve => {
      this.client.on("ready", () => {
        const { id, username: name } = this.client.user;
        const teams = this.client.guilds.array().map(guild => ({
          id: guild.id,
          name: guild.name
        }));
        const currentUser: CurrentUser = {
          id,
          name,
          teams,
          currentTeamId: undefined,
          provider: Providers.discord
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
        vscode.commands.executeCommand(SelfCommands.UPDATE_PRESENCE_STATUSES, {
          userId,
          presence: getPresence(presence),
          provider: "discord"
        });
      });

      this.client.on("message", msg => {
        this.handleIncomingMessage(msg);
        this.handleIncomingLinks(msg);
      });

      this.client.on("messageUpdate", (_, msg: Discord.Message) => {
        this.handleIncomingMessage(msg);
      });

      this.client.on("error", error => {
        Logger.log(`[ERROR] Discord: ${error.message}`);
      });

      this.client.login(this.token);
    });
  }

  handleIncomingMessage(msg: Discord.Message) {
    // If message has guild, we check for current guild
    // Else, message is from a DM or group DM
    const currentGuild = this.getCurrentGuild();
    const { guild } = msg;

    if (!currentGuild) {
      return;
    }

    if (!guild || guild.id === currentGuild.id) {
      let newMessages: ChannelMessages = {};
      const channelId = msg.channel.id;
      const parsed = getMessage(msg);
      const { timestamp } = parsed;
      newMessages[timestamp] = parsed;
      vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
        channelId,
        messages: newMessages,
        provider: "discord"
      });
    }
  }

  handleIncomingLinks(msg: Discord.Message) {
    // For vsls invitations
    const currentGuild = this.getCurrentGuild();
    const { guild } = msg;

    if (!currentGuild) {
      return;
    }

    if (!guild || guild.id === currentGuild.id) {
      const parsed = getMessage(msg);
      let uri: vscode.Uri | undefined;
      try {
        const { text } = parsed;
        if (text.startsWith("http")) {
          uri = vscode.Uri.parse(parsed.text);
          vscode.commands.executeCommand(SelfCommands.HANDLE_INCOMING_LINKS, {
            senderId: parsed.userId,
            uri
          });
        }
      } catch (e) {}
    }
  }

  isConnected(): boolean {
    return !!this.client && !!this.client.readyTimestamp;
  }

  getUserPreferences(): Promise<UserPreferences> {
    const mutedChannels = Array.from(this.mutedChannels);
    return Promise.resolve({ mutedChannels });
  }

  getCurrentGuild(): Discord.Guild | undefined {
    const { currentUserInfo } = this.manager.store;

    if (!!currentUserInfo) {
      const { currentTeamId } = currentUserInfo;
      return this.client.guilds.find(guild => guild.id === currentTeamId);
    }
  }

  async fetchUsers(): Promise<Users> {
    const guild = this.getCurrentGuild();
    const readyTimestamp = (this.client.readyTimestamp / 1000.0).toString();
    let users: Users = {};

    // We first build users from IM channels, and then from the guild members
    this.imChannels = this.client.channels
      .filter(channel => channel.type === "dm")
      .map(channel => {
        const dmChannel = <Discord.DMChannel>channel;
        const { id, recipient } = dmChannel;
        const user = getUser(recipient);
        users[user.id] = user;
        return {
          id,
          name: recipient.username,
          type: ChannelType.im,
          readTimestamp: readyTimestamp,
          unreadCount: 0
        };
      });

    if (!!guild) {
      // Getting guild members requires knowing the guild
      const response = await guild.fetchMembers("", MEMBER_LIMIT);
      response.members.forEach(member => {
        const { user: discordUser, roles } = member;
        const hoistedRole = roles.find(role => role.hoist);
        let roleName = undefined;

        if (!!hoistedRole) {
          roleName = toTitleCase(hoistedRole.name);
        }

        const user = getUser(discordUser);
        users[user.id] = { ...user, roleName };
      });
    }

    return users;
  }

  async fetchUserInfo(userId: string): Promise<User> {
    const discordUser = await this.client.fetchUser(userId);
    return getUser(discordUser);
  }

  fetchChannels(users: Users): Promise<Channel[]> {
    // This fetches channels of the current guild, and (group) DMs.
    // For unreads, we are not retrieving historical unreads, not clear if API supports that.
    const readyTimestamp = (this.client.readyTimestamp / 1000.0).toString();
    const guild = this.getCurrentGuild();
    let categories: { [id: string]: string } = {};

    if (!!guild) {
      guild.channels
        .filter(channel => channel.type === "category")
        .forEach(channel => {
          const { id: channelId, name, muted } = channel;
          categories[channelId] = name;

          if (muted) {
            this.mutedChannels.add(channelId);
          }
        });

      const { currentUserInfo } = this.manager.store;
      const guildChannels: Channel[] = guild.channels
        .filter(channel => channel.type !== "category")
        .filter(channel => {
          if (!!currentUserInfo) {
            const userId = currentUserInfo.id;
            const permissions = channel.permissionsFor(userId);
            const permissionFlag = Discord.Permissions.FLAGS.VIEW_CHANNEL;

            if (!!permissions && permissionFlag) {
              return permissions.has(permissionFlag);
            }
          }

          return false;
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

      const groupChannels = this.client.channels
        .filter(channel => channel.type === "group")
        .map(channel => {
          const groupChannel = <Discord.GroupDMChannel>channel;
          const { id, recipients } = groupChannel;
          return {
            id,
            name: recipients.map(recipient => recipient.username).join(", "),
            type: ChannelType.group,
            readTimestamp: readyTimestamp,
            unreadCount: 0
          };
        });

      return Promise.resolve([
        ...guildChannels,
        ...this.imChannels,
        ...groupChannels
      ]);
    }

    return Promise.resolve([]);
  }

  async loadChannelHistory(channelId: string): Promise<ChannelMessages> {
    const channel: any = this.client.channels.find(
      channel => channel.id === channelId
    );

    // channel.fetchMessages will break for voice channels
    const messages: Discord.Message[] = await channel.fetchMessages({
      limit: HISTORY_LIMIT
    });

    let result: ChannelMessages = {};
    messages.forEach(message => {
      const parsed = getMessage(message);
      const { timestamp } = parsed;
      result[timestamp] = parsed;
    });
    return result;
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

  subscribePresence(users: Users): void {}

  sendThreadReply() {
    return Promise.resolve();
  }

  async updateSelfPresence(
    presence: UserPresence
  ): Promise<UserPresence | undefined> {
    let status: Discord.PresenceStatus;

    switch (presence) {
      case UserPresence.available:
        status = "online";
        break;
      case UserPresence.doNotDisturb:
        status = "dnd";
        break;
      case UserPresence.idle:
        status = "idle";
        break;
      case UserPresence.invisible:
        status = "invisible";
        break;
      default:
        throw new Error("status not supported by discord");
    }

    const response = await this.client.user.setPresence({ status });
    // response.presence.status is always `invisible`
    // Hence we return the original presence input as success
    return presence;
  }

  destroy(): Promise<void> {
    if (!!this.client) {
      return this.client.destroy();
    }

    return Promise.resolve();
  }

  async markChannel(channel: Channel, ts: string): Promise<Channel> {
    // Discord does not have a concept of timestamp, it will acknowledge everything
    // return Promise.resolve(channel);
    const { id: channelId } = channel;
    const discordChannel: any = this.client.channels.find(
      channel => channel.id === channelId
    );
    await discordChannel.acknowledge();
    return { ...channel, readTimestamp: ts };
  }

  fetchThreadReplies(channelId: string, ts: string): Promise<any> {
    // Never called. Discord has no threads.
    return Promise.resolve();
  }

  createIMChannel(user: User): Promise<Channel | undefined> {
    // This is required to share vsls links with users that
    // do not have corresponding DM channels
    return Promise.resolve(undefined);
  }
}
