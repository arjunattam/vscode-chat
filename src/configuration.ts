import * as vscode from "vscode";
import * as str from "./strings";
import { VSCodeCommands, CONFIG_ROOT, SLACK_OAUTH } from "./constants";

const TOKEN_CONFIG_SECTION = "slack.legacyToken";

class ConfigHelper {
  static getRootConfig() {
    return vscode.workspace.getConfiguration(CONFIG_ROOT);
  }

  static getToken(): string {
    // Stored under CONFIG_ROOT.slack.legacyToken
    const rootConfig = this.getRootConfig();

    if (!!rootConfig.get(TOKEN_CONFIG_SECTION)) {
      const { slack } = rootConfig;
      return slack.legacyToken;
    } else {
      const actionItems = [str.SIGN_IN_SLACK];

      vscode.window
        .showInformationMessage(str.TOKEN_NOT_FOUND, ...actionItems)
        .then(selected => {
          switch (selected) {
            case str.SIGN_IN_SLACK:
              this.openUrl(SLACK_OAUTH);
              break;
          }
        });
    }
  }

  static setToken(token: string): Thenable<void> {
    const rootConfig = this.getRootConfig();
    return rootConfig.update(
      TOKEN_CONFIG_SECTION,
      token,
      vscode.ConfigurationTarget.Global
    );
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
