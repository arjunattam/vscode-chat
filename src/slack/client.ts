import { WebClient, WebClientOptions } from "@slack/client";
import ConfigHelper from "../config";
import Logger from "../logger";
import {
  Users,
  Channel,
  ChannelMessages,
  ChannelType,
  User,
  Message,
  UserPreferences,
  CurrentUser,
  Providers
} from "../types";

const CHANNEL_HISTORY_LIMIT = 50;

const USER_LIST_LIMIT = 1000;

// User-defined type guard
// https://github.com/Microsoft/TypeScript/issues/20707#issuecomment-351874491
function notUndefined<T>(x: T | undefined): x is T {
  return x !== undefined;
}

const getFile = (rawFile: any) => {
  return { name: rawFile.name, permalink: rawFile.permalink };
};

const getContent = (attachment: any) => {
  return {
    author: attachment.author_name,
    authorIcon: attachment.author_icon,
    pretext: attachment.pretext,
    title: attachment.title,
    titleLink: attachment.title_link,
    text: attachment.text,
    footer: attachment.footer,
    borderColor: attachment.color
  };
};

const getReaction = (reaction: any) => ({
  name: `:${reaction.name}:`,
  count: reaction.count,
  userIds: reaction.users
});

const getUser = (member: any): User => {
  const { id, profile, real_name, name, deleted } = member;
  const { display_name, image_72, image_24 } = profile;

  return {
    id,
    // Conditional required for bots like @paperbot
    name: display_name ? display_name : name,
    email: profile.email,
    fullName: real_name,
    internalName: name,
    imageUrl: image_72,
    smallImageUrl: image_24,
    isOnline: false,
    isDeleted: deleted
  };
};

export const getMessage = (raw: any): ChannelMessages => {
  const { files, ts, user, text, edited, bot_id } = raw;
  const { attachments, reactions, replies } = raw;
  let parsed: ChannelMessages = {};

  parsed[ts] = {
    userId: user ? user : bot_id,
    timestamp: ts,
    isEdited: !!edited,
    text: text,
    attachment: files ? getFile(files[0]) : undefined,
    reactions: reactions
      ? reactions.map((reaction: any) => getReaction(reaction))
      : [],
    content: attachments ? getContent(attachments[0]) : undefined,
    replies: replies
      ? replies.map((reply: any) => ({
          userId: reply.user,
          timestamp: reply.ts
        }))
      : []
  };

  return parsed;
};

export default class SlackAPIClient {
  client: WebClient;

  constructor(private token: string) {
    let options: WebClientOptions = { retryConfig: { retries: 1 } };
    const customAgent = ConfigHelper.getCustomAgent();

    if (!!customAgent) {
      options.agent = customAgent;
    }

    this.client = new WebClient(token, options);

    this.client.on("rate_limited", retryAfter => {
      Logger.log(`Slack client rate limited: paused for ${retryAfter} seconds`);
    });
  }

  authTest = async (): Promise<CurrentUser | undefined> => {
    const response: any = await this.client.auth.test();
    const { ok } = response;

    if (ok) {
      const { team, user, user_id, team_id } = response;
      return {
        // token: this.token,
        id: user_id,
        name: user,
        teams: [{ id: team_id, name: team }],
        currentTeamId: team_id,
        provider: Providers.slack
      };
    }
  };

  getConversationHistory = async (
    channel: string
  ): Promise<ChannelMessages> => {
    const response: any = await this.client.apiCall("conversations.history", {
      channel,
      limit: CHANNEL_HISTORY_LIMIT
    });
    const { messages, ok } = response;
    let result = {};

    if (ok) {
      messages.forEach((rawMessage: any) => {
        result = {
          ...result,
          ...getMessage(rawMessage)
        };
      });
    }

    return result;
  };

  async getUsers(): Promise<Users> {
    const response: any = await this.client.apiCall("users.list", {
      limit: USER_LIST_LIMIT
    });
    const { members, ok } = response;
    let users: Users = {};

    if (ok) {
      members.forEach((member: any) => {
        const user = getUser(member);
        const { id } = user;
        users[id] = user;
      });

      return users;
    }

    return {};
  }

  async getBotInfo(botId: string): Promise<User | undefined> {
    const response: any = await this.client.bots.info({
      bot: botId
    });
    const { bot, ok } = response;

    if (ok) {
      const { id, name, icons } = bot;
      return {
        id,
        name,
        fullName: name,
        imageUrl: icons.image_72,
        smallImageUrl: icons.image_24,
        isOnline: false,
        isBot: true
      };
    }
  }

  async getUserInfo(userId: string): Promise<User | undefined> {
    const response: any = await this.client.users.info({ user: userId });
    const { ok, user } = response;

    if (ok) {
      return getUser(user);
    }
  }

  async getChannels(users: Users): Promise<Channel[]> {
    const response: any = await this.client.conversations.list({
      exclude_archived: true,
      types: "public_channel, private_channel, mpim, im"
    });
    const { ok, channels } = response;
    const userValues = Object.keys(users).map(key => users[key]);

    if (ok) {
      return channels
        .map((channel: any) => {
          const { is_channel, is_mpim, is_im, is_group } = channel;

          if (is_channel) {
            // Public channels
            return {
              id: channel.id,
              name: channel.name,
              type: ChannelType.channel
            };
          }

          if (is_group && !is_mpim) {
            // Private channels
            return {
              id: channel.id,
              name: channel.name,
              type: ChannelType.channel
            };
          }

          if (is_group && is_mpim) {
            // Groups (multi-party direct messages)
            // Example name: mpdm-user.name--username2--user3-1
            let { id, name } = channel;
            const matched = name.match(/mpdm-([^-]+)((--[^-]+)*)-\d+/);

            if (matched) {
              const first = matched[1];
              const rest = matched[2]
                .split("--")
                .filter((element: string) => !!element);
              const members = [first, ...rest];
              const memberUsers = members
                .map(memberName =>
                  userValues.find(
                    ({ internalName }) => internalName === memberName
                  )
                )
                .filter(notUndefined);
              const isAnyUserDeleted = memberUsers.filter(
                ({ isDeleted }) => isDeleted
              );

              if (isAnyUserDeleted.length > 0) {
                return null;
              } else {
                name = memberUsers.map(({ name }) => name).join(", ");
                return {
                  id: id,
                  name: name,
                  type: ChannelType.group
                };
              }
            }
          }

          if (is_im) {
            // Direct messages
            const { id, user: userId } = channel;

            if (userId in users) {
              const user = users[userId];

              if (!user.isDeleted) {
                const name = user.name;
                return {
                  id,
                  name,
                  type: ChannelType.im
                };
              }
            }
          }
        })
        .filter(Boolean);
    }

    return [];
  }

  getChannelInfo = async (
    originalChannel: Channel
  ): Promise<Channel | undefined> => {
    const { id, type } = originalChannel;
    let response: any;
    let channel;

    try {
      switch (type) {
        case "group":
          response = await this.client.groups.info({ channel: id });
          channel = response.group;
          break;
        case "channel":
          response = await this.client.channels.info({ channel: id });
          channel = response.channel;
          break;
        case "im":
          response = await this.client.conversations.info({
            channel: id
          });
          channel = response.channel;
          break;
      }

      const { unread_count_display, last_read } = channel;
      return {
        ...originalChannel,
        unreadCount: unread_count_display,
        readTimestamp: last_read
      };
    } catch (error) {
      // TODO: this is failing for private groups -> need to investigate why
      console.log("Error fetching channel:", originalChannel.name);
    }
  };

  sendMessage = (
    channelId: string,
    text: string,
    threadTs: string
  ): Promise<any> => {
    return this.client.chat.postMessage({
      channel: channelId,
      text,
      thread_ts: threadTs,
      as_user: true
    });
  };

  markChannel = async (
    channel: Channel,
    ts: string
  ): Promise<Channel | undefined> => {
    const { id, type } = channel;
    let response: any;

    switch (type) {
      case ChannelType.channel:
        response = await this.client.channels.mark({ channel: id, ts });
        break;
      case ChannelType.group:
        response = await this.client.groups.mark({ channel: id, ts });
        break;
      case ChannelType.im:
        response = await this.client.im.mark({ channel: id, ts });
        break;
    }

    const { ok } = response;

    if (ok) {
      return {
        ...channel,
        readTimestamp: ts,
        unreadCount: 0
      };
    }
  };

  openIMChannel = async (user: User): Promise<Channel | undefined> => {
    const { id, name } = user;
    let response: any = await this.client.im.open({
      user: id,
      return_im: true
    });
    const { ok, channel } = response;

    if (ok) {
      return {
        id: channel.id,
        name: `@${name}`,
        type: ChannelType.im,
        unreadCount: 0,
        readTimestamp: undefined
      };
    }
  };

  getUserPrefs = async (): Promise<UserPreferences | undefined> => {
    // Undocumented API: https://github.com/ErikKalkoken/slackApiDoc/blob/master/users.prefs.get.md
    let response: any = await this.client.apiCall("users.prefs.get");
    const { ok, prefs } = response;

    if (ok) {
      const { muted_channels } = prefs;
      return {
        mutedChannels: muted_channels.split(",")
      };
    }
  };

  getReplies = async (
    channelId: string,
    messageTimestamp: string
  ): Promise<Message | undefined> => {
    // https://api.slack.com/methods/conversations.replies
    let response: any = await this.client.conversations.replies({
      channel: channelId,
      ts: messageTimestamp
    });
    // Does not handle has_more in the response yet, could break
    // for large threads
    const { ok, messages } = response;

    if (ok) {
      const parent = messages.find((msg: any) => msg.thread_ts === msg.ts);
      const replies = messages.filter((msg: any) => msg.thread_ts !== msg.ts);
      const parentMessage = getMessage(parent);

      return {
        ...parentMessage[messageTimestamp],
        replies: replies.map((reply: any) => ({
          userId: reply.user,
          timestamp: reply.ts,
          text: reply.text,
          attachment: !!reply.files ? getFile(reply.files[0]) : null
        }))
      };
    }
  };
}
