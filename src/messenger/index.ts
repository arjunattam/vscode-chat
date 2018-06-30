import { RTMClient } from "@slack/client";
import * as EmojiConvertor from "emoji-js";
import SlackAPIClient from "../client/index";
import Logger from "../logger";
import {
  SlackMessage,
  UiMessage,
  SlackChannel,
  SlackCurrentUser,
  SlackStore
} from "../store/interfaces";

const RTMEvents = {
  AUTHENTICATED: "authenticated",
  MESSAGE: "message",
  ERROR: "unable_to_rtm_start"
};

class SlackMessenger {
  messages: SlackMessage[];
  manager: SlackAPIClient;
  channel: SlackChannel;
  rtmClient: RTMClient;
  uiCallback: (message: UiMessage) => void;

  constructor(private store: SlackStore) {
    this.messages = [];
    // TODO(arjun): can use { useRtmConnect: false } for rtm.start
    this.rtmClient = new RTMClient(store.slackToken);
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

      this.rtmClient.start();
    });
  };

  setCurrentChannel(channel: SlackChannel) {
    this.channel = channel;

    this.rtmClient.on(RTMEvents.MESSAGE, event => {
      if (this.channel.id === event.channel) {
        const { user: userId, text, ts: timestamp } = event;
        if (text) {
          // Some messages (like keep-alive) have no text, we ignore them
          this.updateMessages([
            {
              userId,
              text,
              timestamp
            }
          ]);
        }
      }
    });

    this.updateMessages([], true);
    this.loadHistory();
  }

  setUiCallback(uiCallback) {
    this.uiCallback = uiCallback;
  }

  updateMessages(newMessages: SlackMessage[], override: boolean = false) {
    if (override) {
      this.messages = [];
    }

    this.messages = []
      .concat(this.messages, newMessages)
      .filter(
        (message, index, self) =>
          index === self.findIndex(t => t.timestamp === message.timestamp)
      );

    const emoji = new EmojiConvertor();
    emoji.allow_native = true;
    emoji.replace_mode = "unified";

    this.uiCallback({
      messages: this.messages.map(message => {
        return {
          ...message,
          text: emoji.replace_colons(message.text)
        };
      }),
      users: this.store.users,
      channel: this.channel
    });
  }

  loadHistory(): Promise<any> {
    Logger.log(`Loading history for ${this.channel.name}`);
    const client = new SlackAPIClient(this.store.slackToken);

    return client
      .getConversationHistory(this.channel.id)
      .then(messages => {
        Logger.log(`Received ${messages.length} messages`);
        this.updateMessages(messages);
      })
      .catch(error => {
        console.error(error);
      });
  }

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

  sendMessage(text: string) {
    const cleanText = this.stripLinkSymbols(text);
    const { id } = this.channel;

    // The rtm gives an error while sending messages. Might be related to
    // https://github.com/slackapi/node-slack-sdk/issues/527
    // https://github.com/slackapi/node-slack-sdk/issues/550

    // So we use the webclient instead of
    // this.rtmClient.sendMessage(cleanText, id)

    return this.manager
      .sendMessage({ channel: id, text: cleanText })
      .then((result: any) => {
        this.updateMessages([
          {
            userId: this.store.currentUserInfo.id,
            text: text,
            timestamp: result.ts
          }
        ]);
      })
      .catch(error => console.error(error));
  }
}

export default SlackMessenger;
