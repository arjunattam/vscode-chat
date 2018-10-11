import * as vsls from "vsls/vscode";
import {
  VSLS_SERVICE_NAME,
  VslsChatMessage,
  REQUEST_NAME,
  NOTIFICATION_NAME,
  toBaseUser,
  toBaseMessage
} from "./utils";
import { User, Users, ChannelMessages } from "../types";
import { VslsBaseService } from "./base";

export class VslsHostService extends VslsBaseService {
  messages: { [timestamp: string]: VslsChatMessage } = {};
  sharedService: vsls.SharedService;

  async initialize() {
    this.sharedService = await this.liveshare.shareService(VSLS_SERVICE_NAME);

    this.sharedService.onDidChangeIsServiceAvailable(nowAvailable => {
      console.log("change service", nowAvailable);
    });

    this.sharedService.onRequest(REQUEST_NAME.message, payload => {
      if (!!payload) {
        const message = payload[0];
        const { userId, text } = message;
        return this.broadcastMessage(userId, text);
      }
    });

    this.sharedService.onRequest(REQUEST_NAME.fetchUsers, () => {
      return this.fetchUsers();
    });

    this.sharedService.onRequest(REQUEST_NAME.fetchUserInfo, payload => {
      if (!!payload) {
        const userId = payload[0];
        return this.fetchUserInfo(userId);
      }
    });

    this.sharedService.onRequest(REQUEST_NAME.fetchMessages, () => {
      return this.fetchMessagesHistory();
    });
  }

  isConnected() {
    if (!!this.sharedService) {
      return this.sharedService.isServiceAvailable;
    }

    return false;
  }

  fetchUsers(): Promise<Users> {
    const users: Users = {};
    const currentUser = toBaseUser(this.liveshare.session);
    users[currentUser.id] = currentUser;

    this.liveshare.peers.map(peer => {
      const user: User = toBaseUser(peer);
      users[user.id] = user;
    });

    return Promise.resolve(users);
  }

  fetchUserInfo(userId: string): Promise<User> {
    // userId could be current user or one of the peers
    if (!!this.liveshare) {
      const { peerNumber } = this.liveshare.session;

      if (peerNumber.toString() === userId) {
        return Promise.resolve(toBaseUser(this.liveshare.session));
      }

      const peer = this.liveshare.peers.find(
        peer => peer.peerNumber.toString() === userId
      );

      if (!!peer) {
        return Promise.resolve(toBaseUser(peer));
      }
    }
  }

  fetchMessagesHistory(): Promise<ChannelMessages> {
    const result: ChannelMessages = {};
    Object.keys(this.messages).forEach(key => {
      result[key] = toBaseMessage(this.messages[key]);
    });
    return Promise.resolve(result);
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
    this.messages[timestamp] = message;
  }

  sendMessage(text: string, userId: string, channelId: string) {
    this.broadcastMessage(userId, text);
    return Promise.resolve();
  }
}
