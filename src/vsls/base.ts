import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import { SelfCommands } from "../constants";
import { ChannelMessages } from "../types";
import { VslsChatMessage, VSLS_CHANNEL_ID, toBaseMessage } from "./utils";

export abstract class VslsBaseService {
  constructor(protected liveshare: vsls.LiveShare) {}

  abstract sendMessage(
    text: string,
    userId: string,
    channelId: string
  ): Promise<void>;

  abstract isConnected(): boolean;

  updateMessages(message: VslsChatMessage) {
    const { timestamp } = message;
    let newMessages: ChannelMessages = {};
    newMessages[timestamp] = toBaseMessage(message);

    vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
      channelId: VSLS_CHANNEL_ID,
      messages: newMessages
    });
  }
}
