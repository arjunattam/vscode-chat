import * as vscode from "vscode";
import ConfigHelper from "./configuration";

export class SlackProtocolHandler implements vscode.UriHandler {
  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    // vscode://karigari.chat/redirect?url=foobar
    const { path, query } = uri;

    switch (path) {
      case "/redirect":
        const parsed = this.parseQuery(query);
        return ConfigHelper.setToken(parsed.token);
    }
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
