import { RTMClient } from "@slack/client";
import SlackManager from "./manager";
import { SlackMessage, UiMessage } from "./interfaces";

class SlackMessenger {
  messages: SlackMessage[];
  manager: SlackManager;
  uiCallback: (message: UiMessage) => void;
  rtmClient: RTMClient;

  constructor(token: string, public conversationId: string) {
    this.rtmClient = new RTMClient(token);
    this.manager = new SlackManager(token);
    this.messages = [];
    this.rtmClient.start();

    this.rtmClient.on("message", event => {
      const msg = this.getMessageFromEvent(event);
      this.messages.push(msg);
      this.updateUi();
    });
  }

  setUiCallback(uiCallback) {
    this.uiCallback = uiCallback;
  }

  updateUi() {
    this.uiCallback({ messages: this.messages, users: this.manager.users });
  }

  loadHistory() {
    this.manager
      .getConversationHistory(this.conversationId)
      .then(messages => {
        this.messages = messages;
        this.updateUi();
      })
      .catch(error => console.error(error));
  }

  sendMessage(text: string) {
    return this.rtmClient
      .sendMessage(text, this.conversationId)
      .then(result => {
        this.messages.push({
          userId: this.manager.currentUserId,
          text: text,
          timestamp: result.ts
        });
        this.updateUi();
      });
  }

  getMessageFromEvent(event) {
    return { userId: event.user, text: event.text, timestamp: event.ts };
  }
}

export default SlackMessenger;
