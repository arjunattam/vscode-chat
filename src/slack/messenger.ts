import SlackManager from "./manager";
const { RTMClient } = require("@slack/client");

class SlackMessenger {
  messages: string[];
  manager: SlackManager;
  rtmClient;

  constructor(token: string, public conversationId: string) {
    this.rtmClient = new RTMClient(token);
    this.manager = new SlackManager(token);
    this.messages = [];
    this.rtmClient.start();
  }

  sendMessage(text, uiCallback) {
    return this.rtmClient.sendMessage(text, this.conversationId).then(() => {
      this.messages.push(text);
      uiCallback(this.messages);
    });
  }

  getMessageFromEvent(event) {
    const userInfo = this.manager.getUserInfo(event.user);
    let msgUser = event.user;

    if (userInfo) {
      msgUser = userInfo.display_name;
    }

    return `${msgUser}: ${event.text}`;
  }

  setOnMessage(uiCallback) {
    this.rtmClient.on("message", event => {
      const msg = this.getMessageFromEvent(event);
      this.messages.push(msg);
      uiCallback(this.messages);
    });
  }
}

export default SlackMessenger;
