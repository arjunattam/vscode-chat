import * as vsls from "vsls/vscode";
import { REQUEST_NAME, VslsChatMessage, NOTIFICATION_NAME } from "./utils";
import { User, Users, ChannelMessages } from "../types";
import { VslsBaseService } from "./base";

export class VslsGuestService extends VslsBaseService {
  constructor(
    protected liveshare: vsls.LiveShare,
    private serviceProxy: vsls.SharedServiceProxy
  ) {
    super(liveshare);

    serviceProxy.onNotify(NOTIFICATION_NAME.message, (msg: VslsChatMessage) =>
      this.updateMessages(msg)
    );

    if (serviceProxy.isServiceAvailable) {
      this.registerSelf();
    }
  }

  registerSelf() {
    // The host is not able to identify peers, because liveshare.peers
    // apparently returns stale data. Till then, we will use a registration
    // mechanism whenever a guest connects to the shared service
    const { peerNumber, user, role, access } = this.liveshare.session;
    const peer: vsls.Peer = { peerNumber, user, role, access };
    this.serviceProxy.request(REQUEST_NAME.registerGuest, [{ peer }]);
  }

  isConnected() {
    return !!this.serviceProxy ? this.serviceProxy.isServiceAvailable : false;
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
