import * as vscode from "vscode";
import * as str from "./strings";
import IssueReporter from "./issues";
import ConfigHelper from "./config";
import { SelfCommands } from "./constants";

export class ExtensionUriHandler implements vscode.UriHandler {
  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    // vscode://karigari.chat/redirect?url=foobar
    const { path, query } = uri;
    const parsed = this.parseQuery(query);

    switch (path) {
      case "/redirect":
        return ConfigHelper.setToken(parsed.token).then(() => {
          vscode.commands.executeCommand(SelfCommands.RESET_STORE);
        });
      case "/error":
        return this.showIssuePrompt(parsed.msg);
    }
  }

  showIssuePrompt(errorMsg: string) {
    const actionItems = [str.REPORT_ISSUE];
    vscode.window
      .showWarningMessage(str.AUTH_FAILED_MESSAGE, ...actionItems)
      .then(selected => {
        switch (selected) {
          case str.REPORT_ISSUE:
            const issue = `Sign in with Slack failed: ${errorMsg}`;
            IssueReporter.openNewIssue(issue, issue);
        }
      });
  }

  parseQuery(queryString): any {
    // From https://stackoverflow.com/a/13419367
    var query = {};
    var pairs = (queryString[0] === "?"
      ? queryString.substr(1)
      : queryString
    ).split("&");

    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].split("=");
      query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
    }

    return query;
  }
}
