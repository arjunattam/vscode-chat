import * as vscode from "vscode";
import { RTMClient } from "@slack/client";
import * as EmojiConvertor from "emoji-js";
import SlackManager from "./manager";
import Logger from "../logger";
import {
  SlackMessage,
  UiMessage,
  SlackChannel,
  SlackUsers
} from "./interfaces";

class SlackMessenger {
  messages: SlackMessage[];
  manager: SlackManager;
  channel: SlackChannel;
  rtmClient: RTMClient;
  uiCallback: (message: UiMessage) => void;

  constructor(public token: string, context: vscode.ExtensionContext) {
    this.manager = new SlackManager(token, context);
    this.messages = [];

    this.rtmClient = new RTMClient(this.token);
    this.rtmClient.start();
  }

  init(storeUsers: SlackUsers, storeChannels: SlackChannel[]) {
    return this.manager.init(storeUsers, storeChannels);
  }

  setCurrentChannel(channel: SlackChannel) {
    this.channel = channel;

    this.rtmClient.on("message", event => {
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
      users: this.manager.users,
      channel: this.channel
    });
  }

  loadHistory() {
    Logger.log(`Loading history for ${this.channel.name}`);
    this.manager
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
            userId: this.manager.currentUser.id,
            text: text,
            timestamp: result.ts
          }
        ]);
      })
      .catch(error => console.error(error));
  }
}

export default SlackMessenger;
