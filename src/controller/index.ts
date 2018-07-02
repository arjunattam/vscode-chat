import { ExtensionContext } from "vscode";
import SlackMessenger from "../messenger";
import WebviewContainer from "../ui";
import { ExtensionMessage, UiMessage } from "../interfaces";
import { COMMAND_ACTIONS } from "../constants";
import Logger from "../logger";
import CommandHandler from "../commands";
import LinkHandler from "./linkhandler";
import transformer from "./transformers";

/**
 * Handles message passing between the ui and extension
 * code
 */
class ViewController {
  messenger: SlackMessenger | undefined;
  ui: WebviewContainer | undefined;
  isUiReady: Boolean = false; // Vuejs loaded
  pendingMessage: UiMessage = undefined;

  constructor(
    private context: ExtensionContext,
    private onUiVisible: () => void
  ) {}

  setMessenger(messenger: SlackMessenger) {
    this.messenger = messenger;
  }

  loadUi = () => {
    if (this.ui) {
      this.ui.reveal();
    } else {
      const { extensionPath } = this.context;
      this.ui = new WebviewContainer(
        extensionPath,
        () => {
          this.ui = undefined;
          this.isUiReady = false;
        },
        isVisible => (isVisible ? this.onUiVisible() : null)
      );
      this.ui.setMessageHandler(this.sendToExtension);
    }
  };

  isValidCommand(message: ExtensionMessage): Boolean {
    const validNamespaces = Object.keys(COMMAND_ACTIONS);
    return validNamespaces.some(namespace =>
      message.text.startsWith(`/${namespace}`)
    );
  }

  sendMessage = (text: string) => {
    return this.messenger.sendMessage(text);
  };

  handleCommand = (message: ExtensionMessage) => {
    const handler = new CommandHandler();
    return handler.handle(message).then((response: string) => {
      if (response) {
        this.sendMessage(response);
      }
    });
  };

  openLink = (message: ExtensionMessage) => {
    const handler = new LinkHandler();
    return handler.open(message);
  };

  handleInternal = (message: ExtensionMessage) => {
    const { text } = message;

    if (text === "is_ready") {
      this.isUiReady = true;
      return this.pendingMessage ? this.sendToUi(this.pendingMessage) : null;
    }
  };

  sendToExtension = (message: ExtensionMessage) => {
    const { type, text } = message;
    Logger.log(`Sending to extension (${type}) ${text}`);

    switch (type) {
      case "internal":
        return this.handleInternal(message);
      case "link":
        return this.openLink(message);
      case "command":
        // This could be a command for us, or for Slack (handled by next case)
        if (this.isValidCommand(message)) {
          return this.handleCommand(message);
        }
      case "text":
        return text ? this.sendMessage(text) : null;
    }
  };

  sendToUi = (uiMessage: UiMessage) => {
    const { messages } = uiMessage;

    if (!this.isUiReady) {
      this.pendingMessage = uiMessage;
    } else {
      Logger.log(`Sending to ui: ${Object.keys(messages).length} messages`);
      console.log(messages);
      this.ui.update(transformer(uiMessage));
      this.pendingMessage = null;
    }
  };
}

export default ViewController;
