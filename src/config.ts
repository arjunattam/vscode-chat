import * as vscode from "vscode";
import * as str from "./strings";
import { CONFIG_ROOT, SelfCommands } from "./constants";
import { EventSource } from "./interfaces";
import { keychain } from "./utils/keychain";
import { hasExtensionPack } from "./utils";
import IssueReporter from "./issues";

const TOKEN_CONFIG_KEY = "slack.legacyToken";
const TELEMETRY_CONFIG_ROOT = "telemetry";
const TELEMETRY_CONFIG_KEY = "enableTelemetry";

const CREDENTIAL_SERVICE_NAME = "vscode-chat";
const CREDENTIAL_ACCOUNT_NAME = "slack";

class ConfigHelper {
  static getRootConfig() {
    return vscode.workspace.getConfiguration(CONFIG_ROOT);
  }

  static async getToken(): Promise<string> {
    const keychainToken = await keychain.getPassword(
      CREDENTIAL_SERVICE_NAME,
      CREDENTIAL_ACCOUNT_NAME
    );

    if (!!keychainToken) {
      return keychainToken;
    }

    // Let's try for the settings file (pre v0.5.8) and migrate them
    // to the keychain.
    const rootConfig = this.getRootConfig();
    const settingsToken = rootConfig.get<string>(TOKEN_CONFIG_KEY);

    if (!!settingsToken) {
      ConfigHelper.setToken(settingsToken);
      this.clearTokenFromSettings();
      return Promise.resolve(settingsToken);
    }
  }

  static clearTokenFromSettings() {
    const rootConfig = this.getRootConfig();
    rootConfig.update(
      TOKEN_CONFIG_KEY,
      undefined,
      vscode.ConfigurationTarget.Global
    );
  }

  static setToken(token: string): Promise<void> {
    // TODO: There is no token validation. We need to add one.
    return keychain
      .setPassword(CREDENTIAL_SERVICE_NAME, CREDENTIAL_ACCOUNT_NAME, token)
      .then(() => {
        // When token is set, we need to call reset
        vscode.commands.executeCommand(SelfCommands.RESET_STORE);
      });
  }

  static clearToken(): Promise<void> {
    return keychain
      .deletePassword(CREDENTIAL_SERVICE_NAME, CREDENTIAL_ACCOUNT_NAME)
      .then(() => {
        // When token is cleared, we need to call reset
        vscode.commands.executeCommand(SelfCommands.RESET_STORE);
      });
  }

  static askForAuth() {
    const actionItems = [str.SIGN_IN_SLACK];

    if (hasExtensionPack()) {
      // If the extension was download via extension pack, it is
      // possible that the user does not use Slack
      actionItems.push(str.DONT_HAVE_SLACK);
    }

    vscode.window
      .showInformationMessage(str.TOKEN_NOT_FOUND, ...actionItems)
      .then(selected => {
        switch (selected) {
          case str.SIGN_IN_SLACK:
            vscode.commands.executeCommand(SelfCommands.SIGN_IN, {
              source: EventSource.info
            });
            break;
          case str.DONT_HAVE_SLACK:
            const title = `Add new chat provider`;
            const body = `My chat provider is: `;
            IssueReporter.openNewIssue(title, body);
            break;
        }
      });
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
