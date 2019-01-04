import * as vscode from "vscode";
import * as https from "https";
import * as HttpsProxyAgent from "https-proxy-agent";
import { CONFIG_ROOT, SelfCommands } from "../constants";
import { KeychainHelper } from "./keychain";

const TOKEN_CONFIG_KEY = "slack.legacyToken";
const TELEMETRY_CONFIG_ROOT = "telemetry";
const TELEMETRY_CONFIG_KEY = "enableTelemetry";
const CREDENTIAL_SERVICE_NAME = "vscode-chat";
const VSLS_CHAT_TOKEN = "vsls-placeholder-token";

const getAccountName = (provider: string, teamId?: string) => {
  return !!teamId ? `${provider} (${teamId})` : provider;
};

export class ConfigHelper {
  static getRootConfig() {
    return vscode.workspace.getConfiguration(CONFIG_ROOT);
  }

  static updateRootConfig(section: string, value: any): Promise<void> {
    // Convert Thenable to Promise to be able to use Promise.all
    const rootConfig = this.getRootConfig();
    return new Promise((resolve, reject) => {
      rootConfig.update(section, value, vscode.ConfigurationTarget.Global).then(
        result => {
          return resolve(result);
        },
        error => {
          return reject(error);
        }
      );
    });
  }

  static async getToken(
    service: string,
    teamId?: string
  ): Promise<string | null> {
    if (service === "vsls") {
      return VSLS_CHAT_TOKEN;
    }

    const accountName = getAccountName(service, teamId);
    const keychainToken: string | null = await KeychainHelper.get(
      CREDENTIAL_SERVICE_NAME,
      accountName
    );
    return keychainToken;
  }

  static clearTokenFromSettings() {
    this.updateRootConfig(TOKEN_CONFIG_KEY, undefined);
  }

  static async setToken(
    token: string,
    providerName: string,
    teamId?: string
  ): Promise<void> {
    // TODO: it is possible that the keychain will fail
    // See https://github.com/Microsoft/vscode-pull-request-github/commit/306dc5d27460599f3402f4b9e01d97bf638c639f
    const accountName = getAccountName(providerName, teamId);
    await KeychainHelper.set(CREDENTIAL_SERVICE_NAME, accountName, token);

    // When token is set, we need to call reset
    vscode.commands.executeCommand(SelfCommands.SETUP_NEW_PROVIDER, {
      newInitialState: { provider: providerName, teamId }
    });
  }

  static async clearToken(provider: string, teamId?: string): Promise<void> {
    await KeychainHelper.clear(
      CREDENTIAL_SERVICE_NAME,
      getAccountName(provider, teamId)
    );
  }

  static getProxyUrl() {
    // Stored under CONFIG_ROOT.proxyUrl
    const { proxyUrl } = this.getRootConfig();
    return proxyUrl;
  }

  static getTlsRejectUnauthorized() {
    const { rejectTlsUnauthorized } = this.getRootConfig();
    return rejectTlsUnauthorized;
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

  static getCustomAgent() {
    const proxyUrl = this.getProxyUrl();

    if (!!proxyUrl) {
      return new HttpsProxyAgent(proxyUrl);
    }

    const rejectUnauthorized = this.getTlsRejectUnauthorized();

    if (!rejectUnauthorized) {
      return new https.Agent({
        rejectUnauthorized: false
      });
    }
  }
}
