import { WebClient, WebClientOptions } from "@slack/client";
import * as HttpsProxyAgent from "https-proxy-agent";
import ConfigHelper from "../config";
import {
  SlackUsers,
  SlackChannel,
  SlackChannelMessages,
  ChannelType,
  SlackUser,
  SlackMessage,
  UserPreferences
} from "../interfaces";

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
  name: reaction.name,
  count: reaction.count,
  userIds: reaction.users
});

export const getMessage = (raw: any): SlackChannelMessages => {
  const { files, ts, user, text, edited, bot_id } = raw;
  const { attachments, reactions, replies } = raw;
  let parsed: SlackChannelMessages = {};

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

  constructor(token: string) {
    let options: WebClientOptions = { retryConfig: { retries: 1 } };
    const proxyUrl = ConfigHelper.getProxyUrl();

    if (proxyUrl) {
      options.agent = new HttpsProxyAgent(proxyUrl);
    }

    this.client = new WebClient(token, options);
  }

  getConversationHistory = (channel: string): Promise<SlackChannelMessages> => {
    return this.client
      .apiCall("conversations.history", { channel, limit: HISTORY_LIMIT })
      .then((response: any) => {
        const { messages, ok } = response;
        let result = {};
        console.log("history", messages);

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

  getUsers(): Promise<SlackUsers> {
    return this.client.apiCall("users.list", {}).then((response: any) => {
      const { members, ok } = response;
      let users = {};

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
            smallImageUrl: image_24
          };
        });

        return users;
      }
    });
  }

  getBotInfo(botId: string): Promise<SlackUsers> {
    return this.client
      .apiCall("bots.info", { bot: botId })
      .then((response: any) => {
        const { bot, ok } = response;
        let users = {};

        if (ok) {
          const { id, name, icons } = bot;
          users[bot.id] = {
            id,
            name,
            imageUrl: icons.image_72,
            isBot: true
          };
        }

        return users;
      });
  }

  getChannels(users: SlackUsers): Promise<SlackChannel[]> {
    const channels = this.client
      .apiCall("channels.list", { exclude_archived: true })
      .then((response: any) => {
        const { ok, channels } = response;
        if (ok) {
          return channels.map(channel => ({
            id: channel.id,
            name: `#${channel.name}`,
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
          return groups.map(group => {
            const { id, is_mpim } = group;
            let { name } = group;

            if (is_mpim) {
              // Example name: mpdm-user.name--username2--user3-1
              const matched = name.match(/mpdm-([^-]+)((--[^-]+)*)-\d+/);
              if (matched) {
                const first = matched[1];
                const rest = matched[2]
                  .split("--")
                  .filter(element => !!element);
                const members = [first, ...rest].map(element => `@${element}`);
                name = members.join(", ");
              }
            } else {
              name = `#${name}`;
            }

            return {
              id,
              name,
              type: "group"
            };
          });
        }
      });
    const directs = this.client.apiCall("im.list", {}).then((response: any) => {
      const { ok, ims } = response;
      if (ok) {
        return ims.map(im => ({
          id: im.id,
          name: `@${im.user in users ? users[im.user].name : im.user}`,
          type: "im"
        }));
      }
    });
    return Promise.all([channels, groups, directs]).then(
      (values: SlackChannel[][]) => {
        return [].concat(...values);
      }
    );
  }

  getChannelInfo = (originalChannel: SlackChannel): Promise<SlackChannel> => {
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

  sendMessage = ({ channel, text }): Promise<any> => {
    return this.client.chat.postMessage({
      channel,
      text,
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

  openIMChannel = (user: SlackUser): Promise<SlackChannel> => {
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
    // Undocumented API: //https://github.com/ErikKalkoken/slackApiDoc/blob/master/users.prefs.get.md
    return this.client.apiCall("users.prefs.get").then((response: any) => {
      const { ok, prefs } = response;
      console.log("prefs", prefs);

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
  ): Promise<SlackMessage> => {
    // https://api.slack.com/methods/conversations.replies
    return this.client.conversations
      .replies({ channel: channelId, ts: messageTimestamp })
      .then((response: any) => {
        // Does not handle has_more in the response
        const { ok, messages } = response;

        if (ok) {
          const parent = messages.filter(msg => msg.thread_ts === msg.ts)[0];
          const replies = messages.filter(msg => msg.thread_ts !== msg.ts);
          const parentMessage = getMessage(parent);
          return {
            ...parentMessage[messageTimestamp],
            replies: replies.map(reply => ({
              userId: reply.user,
              timestamp: reply.ts,
              text: reply.text
            }))
          };
        }
      });
  };
}
