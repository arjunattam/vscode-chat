import * as vscode from "vscode";
import * as str from "./strings";
import { CONFIG_ROOT, SelfCommands } from "./constants";
import { EventSource } from "./interfaces";

const TOKEN_CONFIG_KEY = "slack.legacyToken";
const TELEMETRY_CONFIG_ROOT = "telemetry";
const TELEMETRY_CONFIG_KEY = "enableTelemetry";

class ConfigHelper {
  static getRootConfig() {
    return vscode.workspace.getConfiguration(CONFIG_ROOT);
  }

  static getToken(): string {
    // Stored under CONFIG_ROOT.slack.legacyToken
    const rootConfig = this.getRootConfig();
    const token = rootConfig.get<string>(TOKEN_CONFIG_KEY);

    if (!!token) {
      return token;
    } else {
      const actionItems = [str.SIGN_IN_SLACK];
      vscode.window
        .showInformationMessage(str.TOKEN_NOT_FOUND, ...actionItems)
        .then(selected => {
          switch (selected) {
            case str.SIGN_IN_SLACK:
              vscode.commands.executeCommand(SelfCommands.SIGN_IN, {
                source: EventSource.info
              });
              break;
          }
        });
    }
  }

  static setToken(token: string): Thenable<void> {
    // TODO: There is no token validation. We need to add one.
    const rootConfig = this.getRootConfig();
    return rootConfig.update(
      TOKEN_CONFIG_KEY,
      token,
      vscode.ConfigurationTarget.Global
    );
  }

  static getProxyUrl() {
    // Stored under CONFIG_ROOT.proxyUrl
    const { proxyUrl } = this.getRootConfig();
    return proxyUrl;
  }

  static hasTelemetry(): boolean {
    const config = vscode.workspace.getConfiguration(TELEMETRY_CONFIG_ROOT);
    return !!config.get<boolean>(TELEMETRY_CONFIG_KEY);
  }

  static hasTravisProvider(): boolean {
    // Stored under CONFIG_ROOT.providers, which is string[]
    const { providers } = this.getRootConfig();
    return providers && providers.indexOf("travis") >= 0;
  }
}

export default ConfigHelper;
