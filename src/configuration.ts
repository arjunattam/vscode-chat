import * as vscode from "vscode";
import * as str from "./strings";
import { CONFIG_ROOT, SLACK_OAUTH } from "./constants";
import { openUrl } from "./utils";

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
              openUrl(SLACK_OAUTH);
              break;
          }
        });
    }
  }

  static setToken(token: string): Thenable<void> {
    // TODO: There is no token validation. We need to add one.
    const rootConfig = this.getRootConfig();
    return rootConfig.update(
      TOKEN_CONFIG_SECTION,
      token,
      vscode.ConfigurationTarget.Global
    );
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
