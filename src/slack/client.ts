import { WebClient, WebClientOptions } from "@slack/client";
import ConfigHelper from "../config";
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

const HISTORY_LIMIT = 50;

const getFile = rawFile => {
  return { name: rawFile.name, permalink: rawFile.permalink };
};

const getContent = attachment => {
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

const getReaction = reaction => ({
  name: `:${reaction.name}:`,
  count: reaction.count,
  userIds: reaction.users
});

export const getMessage = (raw: any): ChannelMessages => {
  const { files, ts, user, text, edited, bot_id } = raw;
  const { attachments, reactions, replies } = raw;
  let parsed: ChannelMessages = {};

  parsed[ts] = {
    userId: user ? user : bot_id,
    timestamp: ts,
    isEdited: !!edited,
    text: text,
    attachment: files ? getFile(files[0]) : null,
    reactions: reactions ? reactions.map(r => getReaction(r)) : [],
    content: attachments ? getContent(attachments[0]) : null,
    replies: replies
      ? replies.map(({ user, ts }) => ({ userId: user, timestamp: ts }))
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
  }

  authTest = async (): Promise<CurrentUser> => {
    const response: any = await this.client.auth.test();
    const { ok } = response;

    if (ok) {
      const { team, user, user_id, team_id } = response;
      return {
        token: this.token,
        id: user_id,
        name: user,
        teams: [{ id: team_id, name: team }],
        currentTeamId: team_id,
        provider: Providers.slack
      };
    }
  };

  getConversationHistory = (channel: string): Promise<ChannelMessages> => {
    return this.client
      .apiCall("conversations.history", { channel, limit: HISTORY_LIMIT })
      .then((response: any) => {
        const { messages, ok } = response;
        let result = {};

        if (ok) {
          messages.forEach(message => {
            result = {
              ...result,
              ...getMessage(message)
            };
          });
        }

        return result;
      });
  };

  getUsers(): Promise<Users> {
    return this.client.apiCall("users.list", {}).then((response: any) => {
      const { members, ok } = response;
      let users: Users = {};

      if (ok) {
        members.forEach(member => {
          const { id, profile, real_name, name } = member;
          const { display_name, image_72, image_24 } = profile;
          users[id] = {
            id,
            // Conditional required for bots like @paperbot
            name: display_name ? display_name : name,
            fullName: real_name,
            imageUrl: image_72,
            smallImageUrl: image_24,
            isOnline: undefined,
            isDeleted: member.deleted
          };
        });

        return users;
      }
    });
  }

  getBotInfo(botId: string): Promise<User> {
    return this.client
      .apiCall("bots.info", { bot: botId })
      .then((response: any) => {
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
      });
  }

  getChannels(users: Users): Promise<Channel[]> {
    const channels = this.client
      .apiCall("channels.list", { exclude_archived: true })
      .then((response: any) => {
        const { ok, channels } = response;
        if (ok) {
          return channels.map(channel => ({
            id: channel.id,
            name: channel.name,
            type: "channel"
          }));
        }
      });

    const groups = this.client
      .apiCall("groups.list", { exclude_archived: true })
      .then((response: any) => {
        // Groups are multi-party DMs and private channels
        const { ok, groups } = response;

        if (ok) {
          return groups
            .map(group => {
              const { id, is_mpim, members: memberIds } = group;
              let { name } = group;

              if (is_mpim) {
                const members = memberIds
                  .map(
                    memberId =>
                      memberId in users ? users[memberId] : undefined
                  )
                  .filter(Boolean);
                const hasKnownUsers = members.length === memberIds.length;
                const hasDeletedUsers =
                  members.filter(user => user.isDeleted).length > 0;

                if (hasKnownUsers && !hasDeletedUsers) {
                  name = members.map(user => user.name).join(", ");
                  return {
                    id,
                    name,
                    type: "group"
                  };
                }
              } else {
                return {
                  id,
                  name,
                  type: "channel"
                };
              }
            })
            .filter(Boolean);
        }
      });

    const directs = this.client.apiCall("im.list", {}).then((response: any) => {
      const { ok, ims } = response;
      if (ok) {
        return ims
          .map(im => {
            const { id, user: userId } = im;

            if (userId in users) {
              const user = users[userId];

              if (!user.isDeleted) {
                const name = user.name;
                return {
                  id,
                  name,
                  type: "im"
                };
              }
            }
          })
          .filter(Boolean);
      }
    });

    return Promise.all([channels, groups, directs]).then(
      (values: Channel[][]) => {
        return [].concat(...values);
      }
    );
  }

  getChannelInfo = (originalChannel: Channel): Promise<Channel> => {
    const { id, type } = originalChannel;
    const getChannel = response => {
      const { unread_count_display, last_read } = response;
      return {
        ...originalChannel,
        unreadCount: unread_count_display,
        readTimestamp: last_read
      };
    };

    switch (type) {
      case "group":
        return this.client.groups
          .info({ channel: id })
          .then((response: any) => {
            const { group } = response;
            return getChannel(group);
          });
      case "channel":
        return this.client.channels
          .info({ channel: id })
          .then((response: any) => {
            const { channel } = response;
            return getChannel(channel);
          });
      case "im":
        return this.client.conversations
          .info({ channel: id })
          .then((response: any) => {
            const { channel } = response;
            return getChannel(channel);
          });
    }
  };

  sendMessage = ({ channel, text, thread_ts }): Promise<any> => {
    return this.client.chat.postMessage({
      channel,
      text,
      thread_ts,
      as_user: true
    });
  };

  markChannel = ({ channel, ts }): Promise<any> => {
    const { id, type } = channel;
    switch (type) {
      case "channel":
        return this.client.channels.mark({ channel: id, ts });
      case "group":
        return this.client.groups.mark({ channel: id, ts });
      case "im":
        return this.client.im.mark({ channel: id, ts });
    }
  };

  openIMChannel = (user: User): Promise<Channel> => {
    const { id, name } = user;
    return this.client.im
      .open({ user: id, return_im: true })
      .then((response: any) => {
        const { ok, channel } = response;

        if (ok) {
          return {
            id: channel.id,
            name: `@${name}`,
            type: ChannelType.im,
            unreadCount: 0,
            readTimestamp: null
          };
        }
      });
  };

  getUserPrefs = (): Promise<UserPreferences> => {
    // Undocumented API: https://github.com/ErikKalkoken/slackApiDoc/blob/master/users.prefs.get.md
    return this.client.apiCall("users.prefs.get").then((response: any) => {
      const { ok, prefs } = response;

      if (ok) {
        const { muted_channels } = prefs;
        return {
          mutedChannels: muted_channels.split(",")
        };
      }
    });
  };

  getReplies = (
    channelId: string,
    messageTimestamp: string
  ): Promise<Message> => {
    // https://api.slack.com/methods/conversations.replies
    return this.client.conversations
      .replies({ channel: channelId, ts: messageTimestamp })
      .then((response: any) => {
        // Does not handle has_more in the response yet, could break
        // for large threads
        const { ok, messages } = response;

        if (ok) {
          const parent = messages.find(msg => msg.thread_ts === msg.ts);
          const replies = messages.filter(msg => msg.thread_ts !== msg.ts);
          const parentMessage = getMessage(parent);
          return {
            ...parentMessage[messageTimestamp],
            replies: replies.map(reply => ({
              userId: reply.user,
              timestamp: reply.ts,
              text: reply.text,
              attachment: !!reply.files ? getFile(reply.files[0]) : null
            }))
          };
        }
      });
  };
}
