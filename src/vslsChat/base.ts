import * as vscode from "vscode";
import { SelfCommands } from "../constants";
import { VslsChatMessage, VSLS_CHAT_CHANNEL, toBaseMessage } from "./utils";

export abstract class VslsBaseService {
    constructor(protected currentUser: User) { }

    abstract sendMessage(text: string, userId: string, channelId: string): Promise<void>;

    abstract isConnected(): boolean;

    abstract fetchUsers(): Promise<Users>;

    abstract fetchUserInfo(userId: string): Promise<User | undefined>;

    abstract fetchMessagesHistory(): Promise<ChannelMessages>;

    updateMessages(message: VslsChatMessage) {
        const { timestamp } = message;
        let newMessages: ChannelMessages = {};
        newMessages[timestamp] = toBaseMessage(message);

        vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
            provider: "vsls",
            channelId: VSLS_CHAT_CHANNEL.id,
            messages: newMessages
        });
    }

    showTyping(userId: string) {
        if (userId !== this.currentUser.id) {
            vscode.commands.executeCommand(SelfCommands.SHOW_TYPING, {
                provider: "vsls",
                channelId: VSLS_CHAT_CHANNEL.id,
                typingUserId: userId
            })
        }
    }
}
