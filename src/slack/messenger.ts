import * as vscode from "vscode";
import { RTMClient, RTMClientOptions } from "@slack/client";
import ConfigHelper from "../config";
import { getMessage } from "./client";
import {
  ChannelMessages,
  CurrentUser,
  Users,
  MessageReply,
  Providers
} from "../types";
import { SelfCommands } from "../constants";

const RTMEvents = {
  AUTHENTICATED: "authenticated",
  MESSAGE: "message",
  ERROR: "unable_to_rtm_start",
  REACTION_ADDED: "reaction_added",
  REACTION_REMOVED: "reaction_removed",
  PRESENCE_CHANGE: "presence_change",
  CHANNEL_MARKED: "channel_marked",
  GROUP_MARKED: "group_marked",
  IM_MARKED: "im_marked"
};

const EventSubTypes = {
  EDITED: "message_changed",
  DELETED: "message_deleted",
  REPLIED: "message_replied"
};

class SlackMessenger {
  rtmClient: RTMClient;

  constructor(private token: string) {
    // We can also use { useRtmConnect: false } for rtm.start
    // instead of rtm.connect, which has more fields in the payload
    let options: RTMClientOptions = {};
    const customAgent = ConfigHelper.getCustomAgent();

    if (!!customAgent) {
      options.agent = customAgent;
    }

    this.rtmClient = new RTMClient(token, options);
    this.rtmClient.on(RTMEvents.MESSAGE, event => {
      const { subtype } = event;
      let newMessages: ChannelMessages = {};

      switch (subtype) {
        case EventSubTypes.DELETED:
          const { deleted_ts } = event;
          newMessages[deleted_ts] = undefined;
          break;

        case EventSubTypes.EDITED:
          const { message } = event;
          newMessages = { ...getMessage(message) };
          break;

        case EventSubTypes.REPLIED:
          // We ignore this type, since these events also show up as normal messages
          // TODO: We might want to use some of these types (copied over from Slack docs):
          // "You may also notice thread_subscribed, thread_unsubscribed, thread_marked update_thread_state event types"
          break;

        default:
          const { text, attachments, files, thread_ts, ts } = event;

          if (!!thread_ts && !!ts && thread_ts !== ts) {
            // This is a thread reply
            const { user, text, channel } = event;
            const reply: MessageReply = {
              userId: user,
              timestamp: ts,
              text
            };
            vscode.commands.executeCommand(
              SelfCommands.UPDATE_MESSAGE_REPLIES,
              {
                parentTimestamp: thread_ts,
                channelId: channel,
                reply
              }
            );
          } else {
            const hasAttachment = attachments && attachments.length > 0;
            const hasFiles = files && files.length > 0;

            if (!!text || hasAttachment || hasFiles) {
              const message = getMessage(event);
              newMessages = {
                ...newMessages,
                ...message
              };
              this.handleMessageLinks(message);
            }
          }
      }

      // On sending messages, this also gets called, which means we
      // send duplicate messages to the webview.
      vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
        channelId: event.channel,
        messages: newMessages
      });
    });

    this.rtmClient.on(RTMEvents.REACTION_ADDED, event => {
      const { user: userId, reaction: reactionName, item } = event;
      const { channel: channelId, ts: msgTimestamp } = item;
      vscode.commands.executeCommand(SelfCommands.ADD_MESSAGE_REACTION, {
        userId,
        channelId,
        msgTimestamp,
        reactionName
      });
    });

    this.rtmClient.on(RTMEvents.REACTION_REMOVED, event => {
      const { user: userId, reaction: reactionName, item } = event;
      const { channel: channelId, ts: msgTimestamp } = item;
      vscode.commands.executeCommand(SelfCommands.REMOVE_MESSAGE_REACTION, {
        userId,
        channelId,
        msgTimestamp,
        reactionName
      });
    });

    this.rtmClient.on(RTMEvents.PRESENCE_CHANGE, event => {
      const { user: userId, presence } = event;
      const isOnline = presence === "active";
      vscode.commands.executeCommand(SelfCommands.UPDATE_USER_PRESENCE, {
        userId,
        isOnline
      });
    });

    this.rtmClient.on(RTMEvents.CHANNEL_MARKED, event => {
      const { channel, ts, unread_count_display } = event;
      vscode.commands.executeCommand(SelfCommands.CHANNEL_MARKED, {
        channelId: channel,
        readTimestamp: ts,
        unreadCount: unread_count_display
      });
    });

    this.rtmClient.on(RTMEvents.GROUP_MARKED, event => {
      const { channel, ts, unread_count_display } = event;
      vscode.commands.executeCommand(SelfCommands.CHANNEL_MARKED, {
        channelId: channel,
        readTimestamp: ts,
        unreadCount: unread_count_display
      });
    });

    this.rtmClient.on(RTMEvents.IM_MARKED, event => {
      const { channel, ts, unread_count_display } = event;
      vscode.commands.executeCommand(SelfCommands.CHANNEL_MARKED, {
        channelId: channel,
        readTimestamp: ts,
        unreadCount: unread_count_display
      });
    });
  }

  isConnected(): boolean {
    return !!this.rtmClient && this.rtmClient.connected;
  }

  start = (): Promise<CurrentUser> => {
    return new Promise((resolve, reject) => {
      this.rtmClient.once(RTMEvents.AUTHENTICATED, response => {
        const { ok, team, self } = response;

        if (ok) {
          const { id, name } = self;
          const { id: teamId, name: teamName } = team;
          return resolve({
            token: this.token,
            id,
            name,
            teams: [{ id: teamId, name: teamName }],
            currentTeamId: teamId,
            provider: Providers.slack
          });
        }
      });

      this.rtmClient.once(RTMEvents.ERROR, error => {
        return reject(error);
      });

      // Note, rtm.start is heavily rate-limited
      this.rtmClient.start();
    });
  };

  sendMessage = ({ channel, text }) => {
    return this.rtmClient.sendMessage(text, channel);
  };

  handleMessageLinks = (incoming: ChannelMessages) => {
    const messageTs = Object.keys(incoming)[0];
    const message = incoming[messageTs];
    let { text, userId } = message;
    let uri: vscode.Uri | undefined;

    if (text.startsWith("<") && text.endsWith(">")) {
      text = text.substring(1, text.length - 1); // Strip link symbols
    }

    try {
      if (text.startsWith("http")) {
        uri = vscode.Uri.parse(text);
        vscode.commands.executeCommand(SelfCommands.HANDLE_INCOMING_LINKS, {
          senderId: userId,
          uri
        });
      }
    } catch (err) {}
  };

  subscribePresence = (users: Users) => {
    this.rtmClient.subscribePresence(Object.keys(users));
  };

  disconnect() {
    if (!!this.rtmClient) {
      return this.rtmClient.disconnect();
    }
  }
}

export default SlackMessenger;
