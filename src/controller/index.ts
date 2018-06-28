import SlackMessenger from "../slack";
import SlackUI from "../ui";
import { ExtensionMessage, UiMessage } from "../slack/interfaces";
import { COMMAND_NAMESPACES } from "../commands";
import Logger from "../logger";
import MessageCommandHandler from "../commands";

/**
 * Handles message passing between the ui and extension
 * code
 */
class ViewController {
  constructor(public ui: SlackUI, public messenger: SlackMessenger) {}

  isValidCommand(message: ExtensionMessage): Boolean {
    return COMMAND_NAMESPACES.some(namespace =>
      message.text.startsWith(`/${namespace}`)
    );
  }

  handleCommand = (message: ExtensionMessage) => {
    const handler = new MessageCommandHandler();
    return handler.handle(message).then((response: string) => {
      if (response) {
        this.messenger.sendMessage(response);
      }
    });
  };

  sendToExtension = (message: ExtensionMessage) => {
    const { type, text } = message;
    Logger.log(`Sending to extension (${type}) ${text}`);

    switch (type) {
      case "command":
        // This could be a command for us, or for Slack (handled by next case)
        if (this.isValidCommand(message)) {
          return this.handleCommand(message);
        }
      case "text":
        this.messenger.sendMessage(text);
        return;
    }
  };

  sendToUi = (uiMessage: UiMessage) => {
    const { messages } = uiMessage;
    Logger.log(`Sending to ui: ${messages.length} messages`);
    this.ui.update(uiMessage);
  };
}

export default ViewController;
