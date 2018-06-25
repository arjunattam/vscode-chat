import { RTMClient } from "@slack/client";
import SlackManager from "./manager";
import { SlackMessage, UiMessage, SlackChannel } from "./interfaces";

class SlackMessenger {
  messages: SlackMessage[];
  manager: SlackManager;
  channel: SlackChannel;
  rtmClient: RTMClient;
  uiCallback: (message: UiMessage) => void;

  constructor(public token: string) {
    this.manager = new SlackManager(token);
    this.messages = [];

    this.rtmClient = new RTMClient(this.token);
    this.rtmClient.start();
  }

  init() {
    return this.manager.init();
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

    this.uiCallback({
      messages: this.messages,
      users: this.manager.users,
      channel: this.channel
    });
  }

  loadHistory() {
    this.manager
      .getConversationHistory(this.channel.id)
      .then(messages => {
        this.updateMessages(messages);
      })
      .catch(error => console.error(error));
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
