import { openUrl, getVersions } from "./utils";

const BASE_ISSUES_URL = "https://github.com/karigari/vscode-chat/issues/new";

export default class IssueReporter {
  static getVersionString() {
    const { extension, os, editor } = getVersions();
    return `- Extension Version: ${extension}\n- OS Version: ${os}\n- VSCode version: ${editor}`;
  }

  static getUrl(query: object) {
    const getParams = p =>
      Object.entries(p)
        .map(kv => kv.map(encodeURIComponent).join("="))
        .join("&");
    return `${BASE_ISSUES_URL}?${getParams(query)}`;
  }

  static openNewIssue(title: string, body: string) {
    const versions = this.getVersionString();
    const bodyText = `${body}\n\n${versions}`.replace(/\n/g, "%0A");
    const params = { title: `[vscode] ${title}`, body: bodyText };
    return openUrl(this.getUrl(params));
  }
}
