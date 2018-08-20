import * as vscode from "vscode";
import * as os from "os";
import { EXTENSION_ID } from "./constants";
import { openUrl } from "./utils";

const BASE_ISSUES_URL = "https://github.com/karigari/vscode-chat/issues/new";

export default class IssueReporter {
  static getVersions() {
    const osVersion = `${os.type()} ${os.arch()} ${os.release()}`;
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    const extVersion = extension.packageJSON.version;
    const vsVersion = vscode.version;
    return `- Extension Version: ${extVersion}\n- OS Version: ${osVersion}\n- VSCode version: ${vsVersion}`;
  }

  static getUrl(query: object) {
    const getParams = p =>
      Object.entries(p)
        .map(kv => kv.map(encodeURIComponent).join("="))
        .join("&");
    return `${BASE_ISSUES_URL}?${getParams(query)}`;
  }

  static openNewIssue(title: string, body: string) {
    const versions = this.getVersions();
    const bodyText = `${body}\n\n${versions}`.replace(/\n/g, "%0A");
    const params = { title, body: bodyText };
    return openUrl(this.getUrl(params));
  }
}
