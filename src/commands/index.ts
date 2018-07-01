import * as vscode from "vscode";
import * as str from "../strings";
import { COMMAND_ACTIONS } from "../constants";
import { ExtensionMessage } from "../interfaces";

interface MessageCommand {
  namespace: string;
  command: string;
}

export default class CommandHandler {
  split = (message: ExtensionMessage): MessageCommand => {
    const pattern = /^\/(\w+) (\w+)$/;
    const { text } = message;
    const trimmed = text.trim();
    const matched = trimmed.match(pattern);

    if (matched) {
      return { namespace: matched[1], command: matched[2] };
    }
  };

  isValidForNamespace = (namespace, command): Boolean => {
    return Object.keys(COMMAND_ACTIONS[namespace]).indexOf(command) >= 0;
  };

  handle = (message: ExtensionMessage) => {
    const { namespace, command } = this.split(message);

    if (namespace && command && this.isValidForNamespace(namespace, command)) {
      const { action, options } = COMMAND_ACTIONS[namespace][command];
      return this.callAction(action, options);
    } else {
      vscode.window.showErrorMessage(str.INVALID_COMMAND(message.text));
    }
  };

  callAction = (action, options): Promise<string> => {
    return this.execute(action, options).then((response: vscode.Uri) => {
      // We append </> to the URL so our link parsing works
      return response ? `<${response.toString()}>` : "";
    });
  };

  execute = (command: string, ...rest: any[]): Promise<any> => {
    // Wraps the executeCommand thenable into a promise
    // https://github.com/Microsoft/vscode/issues/11693#issuecomment-247495996
    return new Promise((resolve, reject) => {
      vscode.commands.executeCommand(command, ...rest).then(
        result => {
          return resolve(result);
        },
        error => {
          vscode.window.showErrorMessage(error.toString());
          return reject(error);
        }
      );
    });
  };
}
