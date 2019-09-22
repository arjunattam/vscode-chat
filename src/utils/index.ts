import * as vscode from "vscode";
import * as os from "os";
import * as gravatar from "gravatar-api";
import * as rp from "request-promise-native";
import {
    VSCodeCommands,
    EXTENSION_ID,
    VSLS_EXTENSION_PACK_ID,
    VSLS_EXTENSION_ID,
    VSLS_SPACES_EXTENSION_ID
} from "../constants";

export const openUrl = (url: string) => {
    const parsedUrl = vscode.Uri.parse(url);
    return vscode.commands.executeCommand(VSCodeCommands.OPEN, parsedUrl);
};

export const openSettings = () => {
    vscode.commands.executeCommand(VSCodeCommands.OPEN_SETTINGS);
};

export const setVsContext = (name: string, value: boolean) => {
    return vscode.commands.executeCommand("setContext", name, value);
};

export const getExtension = (
    extensionId: string
    ): vscode.Extension<any> | undefined => {
    return vscode.extensions.getExtension(extensionId);
};

export interface Versions {
    os: string;
    extension: string;
    editor: string;
}

export const getExtensionVersion = (): string => {
    const extension = getExtension(EXTENSION_ID);
    return !!extension ? extension.packageJSON.version : undefined;
};

export const getVersions = (): Versions => {
    return {
        os: `${os.type()} ${os.arch()} ${os.release()}`,
        extension: getExtensionVersion(),
        editor: vscode.version
    };
};

export const hasVslsExtensionPack = (): boolean => {
    return !!getExtension(VSLS_EXTENSION_PACK_ID);
};

export const hasVslsExtension = (): boolean => {
    return !!getExtension(VSLS_EXTENSION_ID);
};

export const hasVslsSpacesExtension = (): boolean => {
    return !!getExtension(VSLS_SPACES_EXTENSION_ID);
}

export const sanitiseTokenString = (token: string) => {
    const trimmed = token.trim();
    const sansQuotes = trimmed.replace(/['"]+/g, "");
    return sansQuotes;
};

export function uuidv4(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        var r = (Math.random() * 16) | 0,
        v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export function isSuperset(set: Set<any>, subset: Set<any>): boolean {
    for (var elem of subset) {
        if (!set.has(elem)) {
            return false;
        }
    }
    return true;
}

export function difference(setA: Set<any>, setB: Set<any>) {
    var _difference = new Set(setA);
    for (var elem of setB) {
        _difference.delete(elem);
    }
    return _difference;
}

export function equals(setA: Set<any>, setB: Set<any>) {
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

// User-defined type guard
// https://github.com/Microsoft/TypeScript/issues/20707#issuecomment-351874491
export function notUndefined<T>(x: T | undefined): x is T {
    return x !== undefined;
}

export function toTitleCase(str: string) {
    return str.replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

export function toDateString(date: Date) {
    // Returns ISO-format date string for a given date
    let month = (date.getMonth() + 1).toString();
    let day = date.getDate().toString();
    
    if (month.length === 1) {
        month = `0${month}`;
    }
    
    if (day.length === 1) {
        day = `0${day}`;
    }
    
    return `${date.getFullYear()}-${month}-${day}`;
}

export function camelCaseToTitle(text: string) {
    var result = text.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
}

export function titleCaseToCamel(text: string) {
    var result = text.replace(/ /g, "");
    return result.charAt(0).toLowerCase() + result.slice(1);
}

export function gravatarUrl(email: string) {
    return gravatar.imageUrl({
        email,
        parameters: { size: "200", d: "retro" },
        secure: true
    })
}

export async function githubAvatarUrl(email: string): Promise<string | undefined> {
    const uri = `https://api.github.com/search/users?q=${email}+in:email`
    try {
        // TODO: wrapping this in try-catch for rate limits, but we need a better fix
        const response = await rp.get({
            uri,
            json: true,
            resolveWithFullResponse: true,
            headers: {
                'User-Agent': 'vsls-contrib/chat'
            }
        })
        if (response.statusCode === 200) {
            if (response.body.total_count > 0) {
                const result = response.body.items[0];
                return result.avatar_url
            }
        }
    } catch (error) {}
}
