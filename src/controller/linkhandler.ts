import * as vscode from "vscode";
import { ExtensionMessage } from "../interfaces";
import { VSCodeCommands, LiveShareCommands } from "../constants";
import CommandHandler from "../commands";

// Is there a way to get this URL from the extension?
const LIVE_SHARE_BASE_URL = `insiders.liveshare.vsengsaas.visualstudio.com`;

/**
 * Handles external links. Special handling for deep links, like Live Share
 */
export default class LinkHandler {
  open = (message: ExtensionMessage) => {
    const { text } = message;
    let uri: vscode.Uri | undefined;

    try {
      uri = vscode.Uri.parse(text);
    } catch (err) {
      return console.log(`Not a valid uri ${text}`);
    }

    switch (uri.authority) {
      case LIVE_SHARE_BASE_URL:
        // Potentially join VS Live Share
        return this.joinLiveShare(uri);
      default:
        return this.openSimpleLink(uri);
    }
  };

  openSimpleLink = (uri: vscode.Uri) => {
    const handler = new CommandHandler();
    return handler.execute(VSCodeCommands.OPEN, uri);
  };

  joinLiveShare = (uri: vscode.Uri) => {
    const opts = { newWindow: false };
    const handler = new CommandHandler();
    return handler.execute(LiveShareCommands.JOIN, uri.toString(), opts);
  };
}
