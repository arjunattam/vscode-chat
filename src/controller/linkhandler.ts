import * as vscode from "vscode";
import { ExtensionMessage } from "../interfaces";
import { VSCodeCommands, LiveShareCommands } from "../constants";
import CommandHandler from "../commands";

/**
 * Handles external links. Special handling for deep linking like for
 * VS Live Share.
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
      case `insiders.liveshare.vsengsaas.visualstudio.com`:
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
    // Not sure if going by URLs is the best way to handle this.
    // https://insiders.liveshare.vsengsaas.visualstudio.com/join?abcd...
    const opts = { newWindow: false };
    const handler = new CommandHandler();
    return handler.execute(LiveShareCommands.JOIN, uri.toString(), opts);
  };
}
