import * as vscode from "vscode";
import * as str from "../strings";
import { RTMClient, RTMClientOptions } from "@slack/client";
import * as HttpsProxyAgent from "https-proxy-agent";
import ConfigHelper from "../config";
import SlackAPIClient, { getMessage } from "../client";
import { SlackChannelMessages, SlackCurrentUser, IStore } from "../interfaces";
import { LIVE_SHARE_BASE_URL, LiveShareCommands } from "../constants";

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

  constructor(private store: IStore) {
    // We can also use { useRtmConnect: false } for rtm.start
    // instead of rtm.connect, which has more fields in the payload
    let options: RTMClientOptions = {};
    const proxyUrl = ConfigHelper.getProxyUrl();

    if (proxyUrl) {
      options.agent = new HttpsProxyAgent(proxyUrl);
    }

    this.rtmClient = new RTMClient(store.slackToken, options);

    this.rtmClient.on(RTMEvents.MESSAGE, event => {
      const { subtype } = event;
      let newMessages: SlackChannelMessages = {};

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

      this.store.updateMessages(event.channel, newMessages);
    });

    this.rtmClient.on(RTMEvents.REACTION_ADDED, event => {
      const { user: userId, reaction: name, item } = event;
      const { channel: channelId, ts: msgTs } = item;
      this.store.addReaction(channelId, msgTs, userId, name);
    });

    this.rtmClient.on(RTMEvents.REACTION_REMOVED, event => {
      const { user: userId, reaction: name, item } = event;
      const { channel: channelId, ts: msgTs } = item;
      this.store.removeReaction(channelId, msgTs, userId, name);
    });

    this.rtmClient.on(RTMEvents.PRESENCE_CHANGE, event => {
      const { user, presence } = event;
      const isOnline = presence === "active";
      this.store.updateUserPresence(user, isOnline);
    });
  }

  isConnected(): boolean {
    return !!this.rtmClient && this.rtmClient.connected;
  }

  start = (): Promise<SlackCurrentUser> => {
    return new Promise((resolve, reject) => {
      this.rtmClient.once(RTMEvents.AUTHENTICATED, response => {
        const { ok, team, self } = response;
        if (ok) {
          const { id, name } = self;
          const { id: teamId, name: teamName } = team;
          return resolve({
            token: this.store.slackToken,
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

      // rtm.start is heavily rate-limited
      this.rtmClient.start();
    });
  };

  handleMessageCommands = (incoming: SlackChannelMessages) => {
    // We are going to check for vsls links here, as an approach to auto-joining
    // TODO: merge this with the command handler
    const messageTs = Object.keys(incoming)[0];
    const message = incoming[messageTs];
    let { text, userId } = message;
    let uri: vscode.Uri | undefined;

    if (userId === this.store.currentUserInfo.id) {
      // If this is our own message, we will ignore it
      return;
    }

    try {
      if (text.startsWith("<") && text.endsWith(">")) {
        text = text.substring(1, text.length - 1);
      }

      const user = this.store.users[userId];
      uri = vscode.Uri.parse(text);

      if (uri.authority === LIVE_SHARE_BASE_URL && !!user) {
        // We should prompt for auto-joining here
        const infoMessage = str.LIVE_SHARE_INVITE(user.name);
        const actionItems = ["Join", "Ignore"];

        vscode.window
          .showInformationMessage(infoMessage, ...actionItems)
          .then(selected => {
            if (selected === "Join") {
              const opts = { newWindow: false };
              vscode.commands.executeCommand(
                LiveShareCommands.JOIN,
                uri.toString(),
                opts
              );
            }
          });
      }
    } catch (err) {
      // Ignore for now
    }
  };

  stripLinkSymbols = (text: string): string => {
    // To send out live share links and render them correctly,
    // we append </> to the link text. However, this is not
    // handled by normal Slack clients, and should be removed before
    // we actually send the message via the RTM API

    // This is hacky, and we will need a better solution - perhaps
    // we could make all rendering manipulations on the extension side
    // before sending the message to Vuejs for rendering
    if (text.startsWith("<") && text.endsWith(">")) {
      return text.substr(1, text.length - 2);
    } else {
      return text;
    }
  };

  subscribePresence = () => {
    const { users } = this.store;
    this.rtmClient.subscribePresence(Object.keys(users));
  };

  sendMessage(text: string, channelId: string) {
    // The rtm gives an error while sending messages. Might be related to
    // https://github.com/slackapi/node-slack-sdk/issues/527
    // https://github.com/slackapi/node-slack-sdk/issues/550
    //
    // So we use the webclient instead of
    // this.rtmClient.sendMessage(cleanText, id)
    const cleanText = this.stripLinkSymbols(text);
    const { slackToken } = this.store;
    const client = new SlackAPIClient(slackToken);

    return client
      .sendMessage({ channel: channelId, text: cleanText })
      .then((result: any) => {
        let newMessages: SlackChannelMessages = {};
        newMessages[result.ts] = {
          userId: this.store.currentUserInfo.id,
          timestamp: result.ts,
          text,
          content: null,
          reactions: [],
          replies: []
        };
        this.store.updateMessages(channelId, newMessages);
      })
      .catch(error => console.error(error));
  }
}

export default SlackMessenger;
