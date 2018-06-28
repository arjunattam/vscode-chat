import * as vscode from "vscode";
import { COMMAND_ACTIONS } from "../constants";
import { ExtensionMessage } from "../slack/interfaces";

interface MessageCommand {
  namespace: string;
  command: string;
}

export default class MessageCommandHandler {
  split = (message: ExtensionMessage): MessageCommand => {
    const pattern = /^\/(\w+) (\w+)$/;
    const { text } = message;
    const matched = text.match(pattern);

    if (matched) {
      return { namespace: matched[1], command: matched[2] };
    }
  };

  isValidForNamespace = (namespace, command): Boolean => {
    return command in Object.keys(COMMAND_ACTIONS[namespace]);
  };

  handle = (message: ExtensionMessage) => {
    const { namespace, command } = this.split(message);

    if (namespace && command && this.isValidForNamespace(namespace, command)) {
      const action = COMMAND_ACTIONS[namespace][command];
      const options = this.getOptions({ namespace, command });
      return this.callAction(action, options);
    } else {
      vscode.window.showErrorMessage(
        `${message.text} is not a recognised command.`
      );
    }
  };

  getOptions = (message: MessageCommand) => {
    const { namespace, command } = message;

    if (namespace === "live" && command === "start") {
      return { suppressNotification: true };
    } else {
      return {};
    }
  };

  callAction = (action, options): Thenable<string> => {
    return vscode.commands
      .executeCommand(action, options)
      .then((response: vscode.Uri) => {
        // We append </> to the URL so our link parsing works
        return response ? `<${response.toString()}>` : "";
      });
  };
}
