import * as vscode from "vscode";
import * as os from "os";
import {
  VSCodeCommands,
  EXTENSION_ID,
  VSLS_EXTENSION_PACK_ID
} from "../constants";

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

export const hasExtensionPack = (): boolean => {
  return !!getExtension(VSLS_EXTENSION_PACK_ID);
};

export function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isSuperset(set, subset): boolean {
  for (var elem of subset) {
    if (!set.has(elem)) {
      return false;
    }
  }
  return true;
}

export function difference(setA, setB) {
  var _difference = new Set(setA);
  for (var elem of setB) {
    _difference.delete(elem);
  }
  return _difference;
}

export function equals(setA, setB) {
  if (setA.size !== setB.size) {
    return false;
  }

  for (var a of setA) {
    if (!setB.has(a)) {
      return false;
    }
  }

  return true;
}
