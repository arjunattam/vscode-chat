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
        const msg = this.getMessageFromEvent(event);
        this.updateMessages([msg]);
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
      messages: this.messages.map(message => ({
        ...message,
        text: emoji.replace_colons(message.text)
      })),
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

  sendMessage(text: string) {
    return this.rtmClient.sendMessage(text, this.channel.id).then(result => {
      this.updateMessages([
        {
          userId: this.manager.currentUser.id,
          text: text,
          timestamp: result.ts
        }
      ]);
    });
  }

  getMessageFromEvent(event) {
    return { userId: event.user, text: event.text, timestamp: event.ts };
  }
}

export default SlackMessenger;
