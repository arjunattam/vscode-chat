import { ExtensionContext } from "vscode";
import SlackMessenger from "../messenger";
import WebviewContainer from "../ui";
import { ExtensionMessage, UiMessage } from "../interfaces";
import { SLASH_COMMANDS } from "../constants";
import Logger from "../logger";
import CommandDispatch, { MessageCommand } from "./commands";
import transformer from "./transformers";

export const getCommand = (text: string): MessageCommand => {
  const pattern = /^\/(\w+) (\w+)$/;
  const trimmed = text.trim();
  const matched = trimmed.match(pattern);

  if (matched) {
    return { namespace: matched[1], text: matched[2] };
  }
};

/**
 * Handles message passing between the UI and extension
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

  dispatchCommand(command: MessageCommand) {
    const handler = new CommandDispatch();
    handler.handle(command).then(result => {
      const { sendToSlack, response } = result;
      if (sendToSlack && response) {
        this.sendToSlack(response);
      }
    });
  }

  handleCommand = (text: string) => {
    // This could be a command for us, or for Slack (handled by next case)
    const parsed = getCommand(text);

    if (parsed) {
      const { namespace, text } = parsed;

      if (namespace in SLASH_COMMANDS) {
        if (Object.keys(SLASH_COMMANDS[namespace]).indexOf(text) >= 0) {
          // We know how to handle this command
          return this.dispatchCommand(parsed);
        }
      }
    }

    // TODO(arjun): if not valid, then we need to parse and make a chat.command
    // API call, instead of sending it as a simple text message.
    // Docs: https://github.com/ErikKalkoken/slackApiDoc/blob/master/chat.command.md
    return this.sendToSlack(text);
  };

  handleInternal = (text: string) => {
    if (text === "is_ready") {
      this.isUiReady = true;
      return this.pendingMessage ? this.sendToUi(this.pendingMessage) : null;
    }
  };

  sendToSlack = (text: string) => {
    return this.messenger.sendMessage(text);
  };

  sendToExtension = (message: ExtensionMessage) => {
    const { type, text } = message;
    Logger.log(`Sending to extension (${type}) ${text}`);

    switch (type) {
      case "internal":
        return this.handleInternal(text);
      case "link":
        return this.dispatchCommand({ namespace: "open", text });
      case "command":
        return this.handleCommand(text);
      case "text":
        return text ? this.sendToSlack(text) : null;
    }
  };

  sendToUi = (uiMessage: UiMessage) => {
    const { messages } = uiMessage;

    if (!this.isUiReady) {
      this.pendingMessage = uiMessage;
    } else {
      Logger.log(`Sending to ui: ${Object.keys(messages).length} messages`);
      this.ui.update(transformer(uiMessage));
      this.pendingMessage = null;
    }
  };
}

export default ViewController;
