import SlackMessenger from "../slack/";
import SlackUI from "../ui/";
import { ExtensionMessage, UiMessage } from "../slack/interfaces";

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

  sendToUi = (message: UiMessage) => {
    this.ui.update(message);
  };
}

export default ViewController;
