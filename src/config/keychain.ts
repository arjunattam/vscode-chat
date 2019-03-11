import * as vscode from "vscode";
import * as str from "../strings";
import { keychain } from "../utils/keychain";
import IssueReporter from "../issues";
import Logger from "../logger";

const UNDEFINED_ERROR = "System keychain is undefined";

export class KeychainHelper {
  // Adds retry to keychain operations if we are denied access
  static async handleException(error: Error, retryCall: Function) {
    Logger.log(`Keychain access: ${error}`);
    const actionItems = [str.RETRY, str.REPORT_ISSUE];
    const action = await vscode.window.showInformationMessage(
      str.KEYCHAIN_ERROR,
      ...actionItems
    );

    switch (action) {
      case str.RETRY:
        return retryCall();
      case str.REPORT_ISSUE:
        const title = "Unable to access keychain";
        return IssueReporter.openNewIssue(title, `${error}`);
    }
  }

  static async get(service: string, account: string) {
    try {
      if (!keychain) {
        throw new Error(UNDEFINED_ERROR);
      }

      const password = await keychain.getPassword(service, account);
      return password;
    } catch (error) {
      // If user denies, we can catch the error
      // On Mac, this looks like `Error: User canceled the operation.`
      return this.handleException(error, () => this.get(service, account));
    }
  }

  static async set(service: string, account: string, password: string) {
    try {
      if (!keychain) {
        throw new Error(UNDEFINED_ERROR);
      }

      await keychain.setPassword(service, account, password);
    } catch (error) {
      return this.handleException(error, () =>
        this.set(service, account, password)
      );
    }
  }

  static async clear(service: string, account: string) {
    try {
      if (!keychain) {
        throw new Error(UNDEFINED_ERROR);
      }

      await keychain.deletePassword(service, account);
    } catch (error) {
      return this.handleException(error, () => this.clear(service, account));
    }
  }
}
