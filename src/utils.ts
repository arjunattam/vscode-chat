import * as vscode from "vscode";
import * as os from "os";
import { VSCodeCommands, EXTENSION_ID } from "./constants";

export const openUrl = (url: string) => {
  const parsed = vscode.Uri.parse(url);
  return vscode.commands.executeCommand(VSCodeCommands.OPEN, parsed);
};

export const openSettings = () => {
  vscode.commands.executeCommand(VSCodeCommands.OPEN_SETTINGS);
};

export interface Versions {
  os: string;
  extension: string;
  editor: string;
}

export const getVersions = (): Versions => {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  return {
    os: `${os.type()} ${os.arch()} ${os.release()}`,
    extension: extension.packageJSON.version,
    editor: vscode.version
  };
};
