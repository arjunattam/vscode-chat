import * as vscode from "vscode";
import {
  SLASH_COMMANDS,
  LIVE_SHARE_BASE_URL,
  LiveShareCommands,
  VSCodeCommands
} from "../constants";

export interface MessageCommand {
  namespace: string;
  text: string;
}

export interface CommandResponse {
  sendToSlack: Boolean;
  response: string;
}

interface CommandHandler {
  handle: (cmd: MessageCommand) => Promise<CommandResponse>;
}

/**
 * This handle makes VS Code command executions
 */
class VscodeCommandHandler implements CommandHandler {
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

  handle = (cmd: MessageCommand): Promise<CommandResponse> => {
    const { namespace, text } = cmd;
    const commands = SLASH_COMMANDS[namespace];
    const { action, options } = commands[text];
    return this.execute(action, options).then((response: vscode.Uri) => {
      // We append </> to the URL so our link parsing works
      // TODO(arjun) Uri is only valid for `/live share` command
      const responseString = response ? `<${response.toString()}>` : "";
      const sendToSlack = namespace === "live" && text === "share";
      return { sendToSlack, response: responseString };
    });
  };
}

class OpenCommandHandler extends VscodeCommandHandler {
  handle = (cmd: MessageCommand): Promise<CommandResponse> => {
    const { text } = cmd;
    let uri: vscode.Uri | undefined;

    try {
      uri = vscode.Uri.parse(text);
    } catch (err) {
      return new Promise((_, reject) => reject());
    }

    switch (uri.authority) {
      case LIVE_SHARE_BASE_URL:
        const opts = { newWindow: false };
        return this.execute(LiveShareCommands.JOIN, uri.toString(), opts);
      default:
        return this.execute(VSCodeCommands.OPEN, uri);
    }
  };
}

/**
 * Finds the correct command handler for the given command
 * and runs it
 */
export default class CommandDispatch {
  handle = (message: MessageCommand): Promise<CommandResponse> => {
    const { namespace, text } = message;

    if (namespace === "open") {
      // We might have to convert this into
      const openHandler = new OpenCommandHandler();
      return openHandler.handle(message);
    } else {
      // Others are all vs code commands
      const vscodeHandler = new VscodeCommandHandler();
      return vscodeHandler.handle(message);
    }
  };
}
