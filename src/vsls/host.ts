import * as vsls from "vsls/vscode";
import {
  VSLS_SERVICE_NAME,
  VslsChatMessage,
  REQUEST_NAME,
  NOTIFICATION_NAME
} from "./utils";
import { VslsBaseService } from "./base";

export class VslsHostService extends VslsBaseService {
  messages = [];
  sharedService: vsls.SharedService;

  async initialize() {
    this.sharedService = await this.liveshare.shareService(VSLS_SERVICE_NAME);
    console.log("service", this.sharedService.isServiceAvailable);

    this.sharedService.onDidChangeIsServiceAvailable(event => {
      console.log("change service", event);
    });

    this.sharedService.onRequest(REQUEST_NAME.message, payload => {
      if (!!payload) {
        const message = payload[0];
        const { userId, text } = message;
        return this.broadcastMessage(userId, text);
      }
    });
  }

  isConnected() {
    if (!!this.sharedService) {
      return this.sharedService.isServiceAvailable;
    }

    return false;
  }

  broadcastMessage(userId: string, text: string) {
    const timestamp = (+new Date() / 1000.0).toString();
    const message: VslsChatMessage = {
      userId,
      text,
      timestamp
    };
    this.sharedService.notify(NOTIFICATION_NAME.message, message);
    this.updateMessages(message);
  }

  sendMessage(text: string, userId: string, channelId: string) {
    this.broadcastMessage(userId, text);
    return Promise.resolve();
  }
}
