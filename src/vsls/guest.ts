import * as vscode from "vscode";
import * as vsls from "vsls/vscode";
import * as str from "../strings";
import {
  VSLS_SERVICE_NAME,
  REQUEST_NAME,
  VslsChatMessage,
  NOTIFICATION_NAME
} from "./utils";
import { User, Users, ChannelMessages } from "../types";
import { VslsBaseService } from "./base";

export class VslsGuestService extends VslsBaseService {
  serviceProxy: vsls.SharedServiceProxy;

  async initialize() {
    this.serviceProxy = await this.liveshare.getSharedService(
      VSLS_SERVICE_NAME
    );

    if (!this.serviceProxy.isServiceAvailable) {
      vscode.window.showWarningMessage(str.LIVE_SHARE_CHAT_NOT_INITIATED);
    }

    this.serviceProxy.onDidChangeIsServiceAvailable(async nowAvailable => {
      console.log("Availability changed to ", nowAvailable);
    });

    this.serviceProxy.onNotify(
      NOTIFICATION_NAME.message,
      (msg: VslsChatMessage) => this.updateMessages(msg)
    );
  }

  isConnected() {
    if (!!this.serviceProxy) {
      return this.serviceProxy.isServiceAvailable;
    }

    return false;
  }

  async fetchUsers(): Promise<Users> {
    if (this.serviceProxy.isServiceAvailable) {
      const response = await this.serviceProxy.request(
        REQUEST_NAME.fetchUsers,
        []
      );
      return response;
    }
  }

  async fetchUserInfo(userId: string): Promise<User> {
    if (this.serviceProxy.isServiceAvailable) {
      const response = await this.serviceProxy.request(
        REQUEST_NAME.fetchUserInfo,
        [userId]
      );
      return response;
    }
  }

  async fetchMessagesHistory(): Promise<ChannelMessages> {
    if (this.serviceProxy.isServiceAvailable) {
      const response = await this.serviceProxy.request(
        REQUEST_NAME.fetchMessages,
        []
      );
      return response;
    }
  }

  async sendMessage(text: string, userId: string, channelId: string) {
    const payload = { text, userId };

    try {
      if (this.serviceProxy.isServiceAvailable) {
        await this.serviceProxy.request(REQUEST_NAME.message, [payload]);
        return Promise.resolve();
      }
    } catch (error) {
      console.log("sending error", error);
    }
  }
}
