import * as vscode from "vscode";
import { SelfCommands } from "../constants";
import { VSLS_CHAT_CHANNEL } from "../vslsChat/utils";

const CHAT_OCTICON = "$(comment-discussion)";

export abstract class BaseStatusItem {
    protected item: vscode.StatusBarItem;
    protected disposableCommand: vscode.Disposable;
    protected unreadCount: number = 0;
    protected isVisible: boolean = false;

    constructor(baseCommand: string, commandArgs: ChatArgs, commandModifier: string) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

        // We construct a new command to send args with base command
        // From: https://github.com/Microsoft/vscode/issues/22353#issuecomment-325293438
        const compound = `${baseCommand}.${commandModifier}.status`;
        this.disposableCommand = vscode.commands.registerCommand(compound, () => {
            return vscode.commands.executeCommand(baseCommand, commandArgs);
        });

        this.item.command = compound;
    }

    abstract updateCount(unreads: number): void;

    show() {
        if (!this.isVisible) {
            this.item.show();
            this.isVisible = true;
        }
    }

    hide() {
        if (this.isVisible) {
            this.item.hide();
            this.isVisible = false;
        }
    }

    dispose() {
        this.item.dispose();
        this.disposableCommand.dispose();
    }
}

export class UnreadsStatusItem extends BaseStatusItem {
    teamName: string;
    providerName: string;

    constructor(providerName: string, team: Team) {
        const baseCommand = SelfCommands.CHANGE_CHANNEL;
        let chatArgs: ChatArgs = {
            providerName,
            source: EventSource.status
        };

        const modifier = `${providerName}.${team.id}`; // This ensures discord teams have separate items
        super(baseCommand, chatArgs, modifier);
        this.providerName = providerName;
        this.teamName = team.name;
    }

    updateCount(unreads: number) {
        this.unreadCount = unreads;
        this.item.text = `${CHAT_OCTICON} ${this.teamName}: ${unreads} new`;
        return this.unreadCount > 0 ? this.show() : this.hide();
    }
}
