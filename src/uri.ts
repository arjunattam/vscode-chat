import * as vscode from "vscode";

export class SlackProtocolHandler implements vscode.UriHandler {
  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    // vscode://karigari.chat/clone?url=foobar
    console.log("handle uri called", uri);

    // Get code query param
    // http://localhost:3000/test?code=282186700213.419161402101.5a3c6fa9ecb33362174a7a31739284373903de28bee85649599414d530794110&state=
  }
}
