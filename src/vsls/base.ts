import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import { SelfCommands } from "../constants";
import { ChannelMessages, User, Users } from "../types";
import { VslsChatMessage, VSLS_CHANNEL, toBaseMessage } from "./utils";

export abstract class VslsBaseService {
  constructor(protected liveshare: vsls.LiveShare) {}

  abstract sendMessage(
    text: string,
    userId: string,
    channelId: string
  ): Promise<void>;

  abstract isConnected(): boolean;

  abstract fetchUsers(): Promise<Users>;

  abstract fetchUserInfo(userId: string): Promise<User>;

  abstract fetchMessagesHistory(): Promise<ChannelMessages>;

  updateMessages(message: VslsChatMessage) {
    const { timestamp } = message;
    let newMessages: ChannelMessages = {};
    newMessages[timestamp] = toBaseMessage(message);

    vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
      channelId: VSLS_CHANNEL.id,
      messages: newMessages
    });
  }
}
