import * as vscode from "vscode";
import * as str from "./strings";
import { VSCodeCommands, SETUP_URL, SLACK_TOKEN_URL } from "./constants";

const CONFIG_ROOT = "chat";

class ConfigHelper {
  static getRootConfig() {
    // Returns config under namespace CONFIG_ROOT
    return vscode.workspace.getConfiguration(CONFIG_ROOT);
  }

  static getToken() {
    // Stored under CONFIG_ROOT.slack.legacyToken
    const { slack } = this.getRootConfig();

    if (slack && slack.legacyToken) {
      return slack.legacyToken;
    } else {
      const actionItems = [
        str.GENERATE_TOKEN,
        str.OPEN_SETTINGS,
        str.OPEN_SETUP_INSTRUCTIONS
      ];
      // TODO: we should raise a friendly input box to set the token
      vscode.window
        .showInformationMessage(str.TOKEN_NOT_FOUND, ...actionItems)
        .then(selected => {
          switch (selected) {
            case str.GENERATE_TOKEN:
              this.openUrl(SLACK_TOKEN_URL);
              break;
            case str.OPEN_SETTINGS:
              this.openSettings();
              break;
            case str.OPEN_SETUP_INSTRUCTIONS:
              this.openUrl(SETUP_URL);
              break;
          }
        });
    }
  }

  static openUrl(url: string) {
    const parsed = vscode.Uri.parse(url);
    return vscode.commands.executeCommand(VSCodeCommands.OPEN, parsed);
  }

  static openSettings() {
    vscode.commands.executeCommand(VSCodeCommands.OPEN_SETTINGS);
  }

  static getProxyUrl() {
    // Stored under CONFIG_ROOT.proxyUrl
    const { proxyUrl } = this.getRootConfig();
    return proxyUrl;
  }

  static hasTravisProvider() {
    // Stored under CONFIG_ROOT.providers, which is string[]
    const { providers } = this.getRootConfig();
    return providers && providers.indexOf("travis") >= 0;
  }
}

export default ConfigHelper;
