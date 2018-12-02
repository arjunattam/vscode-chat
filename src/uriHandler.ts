import * as vscode from "vscode";
import * as str from "./strings";
import IssueReporter from "./issues";
import ConfigHelper from "./config";

export class ExtensionUriHandler implements vscode.UriHandler {
  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    // vscode://karigari.chat/redirect?url=foobar
    const { path, query } = uri;
    const parsed = this.parseQuery(query);
    const { token, msg, service, team } = parsed;

    switch (path) {
      case "/redirect":
        return ConfigHelper.setToken(token, service, team);
      case "/error":
        return this.showIssuePrompt(msg, service);
    }
  }

  showIssuePrompt(errorMsg: string, service: string) {
    const actionItems = [str.REPORT_ISSUE];
    vscode.window
      .showWarningMessage(str.AUTH_FAILED_MESSAGE, ...actionItems)
      .then(selected => {
        switch (selected) {
          case str.REPORT_ISSUE:
            const issue = `Sign in with ${service} failed: ${errorMsg}`;
            IssueReporter.openNewIssue(issue, issue);
        }
      });
  }

  parseQuery(queryString: string): any {
    // From https://stackoverflow.com/a/13419367
    const filtered =
      queryString[0] === "?" ? queryString.substr(1) : queryString;
    const pairs = filtered.split("&");
    var query: { [key: string]: string } = {};

    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].split("=");
      const key: string = decodeURIComponent(pair[0]);
      const value: string = decodeURIComponent(pair[1] || "");
      query[key] = value;
    }

    return query;
  }
}
