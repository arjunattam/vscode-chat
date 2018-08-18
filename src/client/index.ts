import { WebClient, WebClientOptions } from "@slack/client";
import * as HttpsProxyAgent from "https-proxy-agent";
import ConfigHelper from "../configuration";
import {
  SlackUsers,
  SlackChannel,
  SlackChannelMessages,
  ChannelType,
  SlackUser
} from "../interfaces";

const HISTORY_LIMIT = 50;

const getFile = rawFile => {
  return { name: rawFile.name, permalink: rawFile.permalink };
};

const getContent = rawAttachment => {
  return {
    author: rawAttachment.author_name,
    authorIcon: rawAttachment.author_icon,
    pretext: rawAttachment.pretext,
    title: rawAttachment.title,
    titleLink: rawAttachment.title_link,
    text: rawAttachment.text,
    footer: rawAttachment.footer,
    borderColor: rawAttachment.color
  };
};

const getReaction = rawReaction => ({
  name: rawReaction.name,
  count: rawReaction.count,
  userIds: rawReaction.users
});

export const getMessage = (raw: any): SlackChannelMessages => {
  const { files, ts, user, text, edited, bot_id, attachments, reactions } = raw;
  let parsed: SlackChannelMessages = {};

  parsed[ts] = {
    userId: user ? user : bot_id,
    timestamp: ts,
    isEdited: !!edited,
    text: text,
    attachment: files ? getFile(files[0]) : null,
    reactions: reactions ? reactions.map(r => getReaction(r)) : [],
    content: attachments ? getContent(attachments[0]) : null
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

  getAllUsers(): Promise<SlackUsers> {
    return this.client.apiCall("users.list", {}).then((response: any) => {
      const { members, ok } = response;
      let users = {};

      if (ok) {
        members.forEach(member => {
          users[member.id] = {
            id: member.id,
            name: member.name,
            imageUrl: member.profile.image_72
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
      const { unread_count, last_read } = response;
      return {
        ...originalChannel,
        unreadCount: unread_count,
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
}
