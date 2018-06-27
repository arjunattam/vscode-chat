import SlackMessenger from "../slack";
import SlackUI from "../ui";
import { ExtensionMessage, UiMessage } from "../slack/interfaces";
import Logger from "../logger";

/**
 * Handles message passing between the ui and extension
 * code
 */
class ViewController {
  constructor(public ui: SlackUI, public messenger: SlackMessenger) {}

  sendToExtension = (message: ExtensionMessage) => {
    const { command, text } = message;
    switch (command) {
      case "send":
        this.messenger.sendMessage(text);
        return;
    }
  };

  sendToUi = (uiMessage: UiMessage) => {
    const { messages } = uiMessage;
    Logger.log(`Sending to ui: ${messages.length}`);
    this.ui.update(uiMessage);
  };
}

export default ViewController;
