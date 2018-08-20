import * as vscode from "vscode";
import { VSCodeCommands } from "./constants";

export const openUrl = (url: string) => {
  const parsed = vscode.Uri.parse(url);
  return vscode.commands.executeCommand(VSCodeCommands.OPEN, parsed);
};

export const openSettings = () => {
  vscode.commands.executeCommand(VSCodeCommands.OPEN_SETTINGS);
};
