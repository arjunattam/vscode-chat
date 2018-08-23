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

export const getExtension = (extensionId): vscode.Extension<any> => {
  return vscode.extensions.getExtension(extensionId);
};

export interface Versions {
  os: string;
  extension: string;
  editor: string;
}

export const getExtensionVersion = () => {
  const extension = getExtension(EXTENSION_ID);
  return extension.packageJSON.version;
};

export const getVersions = (): Versions => {
  return {
    os: `${os.type()} ${os.arch()} ${os.release()}`,
    extension: getExtensionVersion(),
    editor: vscode.version
  };
};
