import * as vscode from "vscode";
import * as rp from "request-promise-native";
import {
  CommandHandler,
  CommandResponse,
  MessageCommand
} from "../controller/commands";
import { TRAVIS_SCHEME } from "../constants";

function getTravisBuild(username: string, reponame: string, build: string) {
  return rp({
    baseUrl: "https://api.travis-ci.org/",
    uri: `repos/${username}/${reponame}/builds/${build}`,
    json: true,
    headers: {
      Accept: "application/vnd.travis-ci.2.1+json"
    }
  }).then(response => {
    const { jobs } = response;

    if (jobs) {
      return rp({
        baseUrl: "https://api.travis-ci.org/",
        uri: `jobs/${jobs[0].id}/log`
      });
    }
  });
}

function stripAnsiEscapes(input: string) {
  // Credits: https://stackoverflow.com/a/29497680/1469222
  return input.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );
}

export class TravisLinkHandler implements CommandHandler {
  handle(cmd: MessageCommand): Promise<CommandResponse> {
    const { subcommand } = cmd;
    const { path } = vscode.Uri.parse(subcommand);
    const matched = path.match(/^\/(.+)\/(.+)\/(.+)\/(.+)$/);

    if (!!matched && matched.length) {
      const user = matched[1];
      const repo = matched[2];
      const buildId = matched[4];
      vscode.window.showTextDocument(
        vscode.Uri.parse(`${TRAVIS_SCHEME}://${user}/${repo}/${buildId}`),
        { viewColumn: vscode.ViewColumn.One }
      );
    }

    const response: CommandResponse = { sendToSlack: false, response: "" };
    return Promise.resolve(response);
  }
}

class TravisDocumentContentProvider
  implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): vscode.ProviderResult<string> {
    const { authority, path } = uri;
    const splitPath = path.split("/");
    return getTravisBuild(authority, splitPath[1], splitPath[2]).then(
      response => stripAnsiEscapes(response)
    );
  }
}

export default new TravisDocumentContentProvider();
