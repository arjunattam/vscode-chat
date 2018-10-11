import * as vsls from "vsls/vscode";
import {
  VSLS_SERVICE_NAME,
  REQUEST_NAME,
  VslsChatMessage,
  NOTIFICATION_NAME
} from "./utils";
import { VslsBaseService } from "./base";

export class VslsGuestService extends VslsBaseService {
  serviceProxy: vsls.SharedServiceProxy;

  async initialize() {
    this.serviceProxy = await this.liveshare.getSharedService(
      VSLS_SERVICE_NAME
    );

    console.log("proxy", this.serviceProxy.isServiceAvailable);

    this.serviceProxy.onDidChangeIsServiceAvailable(event => {
      console.log("change proxy", event);
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

  async sendMessage(text: string, userId: string, channelId: string) {
    console.log("sending", text, userId);
    const payload = { text, userId };

    try {
      await this.serviceProxy.request(REQUEST_NAME.message, [payload]);
      return Promise.resolve();
    } catch (error) {
      console.log("sending error", error);
    }
  }
}
