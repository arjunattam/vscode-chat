import * as vscode from "vscode";
import * as vsls from "vsls";
import {
  SLASH_COMMANDS,
  LIVE_SHARE_BASE_URL,
  TRAVIS_BASE_URL,
  VSCodeCommands
} from "../constants";
import { TravisLinkHandler } from "../bots/travis";
import { ConfigHelper } from "../config";

export interface MessageCommand {
  namespace: string;
  subcommand: string;
}

export interface CommandResponse {
  sendToSlack: Boolean;
  response: string;
}

export interface CommandHandler {
  handle: (cmd: MessageCommand) => Promise<CommandResponse>;
}

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
    const { namespace, subcommand } = cmd;
    const commands = SLASH_COMMANDS[namespace];
    const { action, options } = commands[subcommand];
    return this.execute(action, options).then((response: vscode.Uri) => {
      // We append </> to the URL so our link parsing works
      // TODO(arjun) Uri is only valid for `/live share` command
      const responseString = response ? `<${response.toString()}>` : "";
      const sendToSlack = namespace === "live" && subcommand === "share";
      return { sendToSlack, response: responseString };
    });
  };
}

class OpenCommandHandler extends VscodeCommandHandler {
  handle = async (cmd: MessageCommand): Promise<any> => {
    const { subcommand } = cmd;
    let uri: vscode.Uri | undefined;

    try {
      uri = vscode.Uri.parse(subcommand);

      switch (uri.authority) {
        case LIVE_SHARE_BASE_URL:
          const liveshare = await vsls.getApi();
          const opts: vsls.JoinOptions = { newWindow: false };

          if (liveshare) {
            await liveshare.join(uri, opts);
          }

          break;
        case TRAVIS_BASE_URL:
          if (ConfigHelper.hasTravisProvider()) {
            const travisHandler = new TravisLinkHandler();
            return travisHandler.handle(cmd);
          }
        default:
          return this.execute(VSCodeCommands.OPEN, uri);
      }
    } catch (err) {
      // return new Promise((_, reject) => reject());
    }
  };
}

/**
 * Finds the correct command handler for the given command
 * and runs it
 */
export default class CommandDispatch {
  handle = (message: MessageCommand): Promise<CommandResponse> => {
    const { namespace, subcommand } = message;

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
