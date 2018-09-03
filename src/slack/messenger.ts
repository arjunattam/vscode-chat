import * as vscode from "vscode";
import { RTMClient, RTMClientOptions } from "@slack/client";
import * as HttpsProxyAgent from "https-proxy-agent";
import ConfigHelper from "../config";
import { getMessage } from "./client";
import { ChannelMessages, CurrentUser, Users } from "../interfaces";
import { LIVE_SHARE_BASE_URL, SelfCommands } from "../constants";

const RTMEvents = {
  AUTHENTICATED: "authenticated",
  MESSAGE: "message",
  ERROR: "unable_to_rtm_start",
  REACTION_ADDED: "reaction_added",
  REACTION_REMOVED: "reaction_removed",
  PRESENCE_CHANGE: "presence_change"
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
    const proxyUrl = ConfigHelper.getProxyUrl();

    if (proxyUrl) {
      options.agent = new HttpsProxyAgent(proxyUrl);
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
          console.log("--- replied", event);
          // You may also notice thread_subscribed, thread_unsubscribed, thread_marked update_thread_state event types
          break;

        default:
          const { text, attachments, files } = event;
          const hasAttachment = attachments && attachments.length > 0;
          const hasFiles = files && files.length > 0;
          if (!!text || hasAttachment || hasFiles) {
            const message = getMessage(event);
            newMessages = {
              ...newMessages,
              ...message
            };
            this.handleMessageCommands(message);
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
      // this.store.addReaction(channelId, msgTs, userId, name);
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
      // this.store.removeReaction(channelId, msgTs, userId, name);
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
      // this.store.updateUserPresence(user, isOnline);
      vscode.commands.executeCommand(SelfCommands.UPDATE_USER_PRESENCE, {
        userId,
        isOnline
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
            teamId,
            teamName
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

  handleMessageCommands = (incoming: ChannelMessages) => {
    // We are going to check for vsls links here, as an approach to auto-joining
    // TODO: This shouldn't be restricted to Slack
    const messageTs = Object.keys(incoming)[0];
    const message = incoming[messageTs];
    let { text, userId } = message;
    let uri: vscode.Uri | undefined;

    if (text.startsWith("<") && text.endsWith(">")) {
      // Strip link symbols
      text = text.substring(1, text.length - 1);
    }

    try {
      uri = vscode.Uri.parse(text);

      if (uri.authority === LIVE_SHARE_BASE_URL) {
        vscode.commands.executeCommand(SelfCommands.LIVE_SHARE_JOIN_PROMPT, {
          senderId: userId,
          messageUri: uri
        });
      }
    } catch (err) {
      // Ignore for now
    }
  };

  subscribePresence = (users: Users) => {
    this.rtmClient.subscribePresence(Object.keys(users));
  };
}

export default SlackMessenger;
