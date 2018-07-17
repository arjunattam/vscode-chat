import * as vscode from "vscode";
import * as str from "./strings";

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
      vscode.window.showErrorMessage(str.TOKEN_NOT_FOUND);
      return;
    }
  }

  static hasTravisProvider() {
    // Stored under CONFIG_ROOT.providers, which is string[]
    const { providers } = this.getRootConfig();
    return providers && providers.indexOf("travis") >= 0;
  }
}

export default ConfigHelper;
