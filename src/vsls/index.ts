import * as vsls from "vsls/vscode";
import {
  IChatProvider,
  User,
  Channel,
  Users,
  Message,
  ChannelMessages,
  UserPreferences,
  CurrentUser,
  Team,
  Providers,
  ChannelType
} from "../types";
import { VSLS_SERVICE_NAME, toBaseUser } from "./utils";
import { VslsHostService } from "./host";
import { VslsGuestService } from "./guest";

const VSLS_TOKEN_STRING = "vsls-placeholder-token";

export class VslsChatProvider implements IChatProvider {
  liveshare: vsls.LiveShare;
  hostService: VslsHostService;
  guestService: VslsGuestService;

  async connect(): Promise<CurrentUser> {
    this.liveshare = await vsls.getApiAsync();
    console.log("session", this.liveshare.session);
    const { peerNumber, user, role, id: sessionId } = this.liveshare.session;

    this.liveshare.onDidChangePeers(event => {
      console.log("peers change", event);
    });

    this.liveshare.onDidChangeSession(event => {
      console.log("session change", event);
    });

    if (!!sessionId) {
      if (role === vsls.Role.Host) {
        this.hostService = new VslsHostService(this.liveshare);
        await this.hostService.initialize();
      } else if (role === vsls.Role.Guest) {
        this.guestService = new VslsGuestService(this.liveshare);
        await this.guestService.initialize();
      }

      const sessionTeam: Team = {
        id: sessionId,
        name: sessionId
      };

      return {
        id: peerNumber.toString(),
        name: user.displayName,
        token: VSLS_TOKEN_STRING,
        teams: [{ ...sessionTeam }],
        currentTeamId: sessionTeam.id,
        provider: Providers.vsls
      };
    }
  }

  isConnected(): boolean {
    if (!!this.liveshare) {
      const { role } = this.liveshare.session;

      if (role === vsls.Role.Host) {
        return this.hostService.isConnected();
      } else if (role === vsls.Role.Guest) {
        return this.guestService.isConnected();
      }
    }
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
    const peer = this.liveshare.peers.find(
      peer => peer.peerNumber.toString() === userId
    );

    if (!!peer) {
      return Promise.resolve({
        id: peer.peerNumber.toString(),
        name: peer.user.displayName,
        fullName: peer.user.displayName,
        imageUrl: "",
        smallImageUrl: "",
        isOnline: true
      });
    }
  }

  sendMessage(
    text: string,
    currentUserId: string,
    channelId: string
  ): Promise<void> {
    const { role } = this.liveshare.session;

    if (role === vsls.Role.Host) {
      return this.hostService.sendMessage(text, currentUserId, channelId);
    } else if (role === vsls.Role.Guest) {
      return this.guestService.sendMessage(text, currentUserId, channelId);
    }
  }

  loadChannelHistory(channelId: string): Promise<ChannelMessages> {
    // TODO: host can pull out from cache, guest can request for it
    return Promise.resolve({});
  }

  destroy(): Promise<void> {
    // TODO: Move to host?
    // return this.liveshare.unshareService(VSLS_SERVICE_NAME);
    return Promise.resolve();
  }

  getToken(): Promise<string> {
    return Promise.resolve(VSLS_TOKEN_STRING);
  }

  getUserPrefs(): Promise<UserPreferences> {
    return Promise.resolve({});
  }

  fetchChannels(users: Users): Promise<Channel[]> {
    const defaultChannel: Channel = {
      id: "vsls-channel-id",
      name: "vsls-channel-name",
      type: ChannelType.channel,
      readTimestamp: undefined,
      unreadCount: 0
    };
    return Promise.resolve([defaultChannel]);
  }

  fetchChannelInfo(channel: Channel): Promise<Channel> {
    return Promise.resolve({ ...channel });
  }

  subscribePresence(users: Users) {}

  markChannel(channel: Channel, ts: string): Promise<Channel> {
    return Promise.resolve({ ...channel });
  }

  validateToken: (token: string) => Promise<CurrentUser>;
  fetchThreadReplies: (channelId: string, ts: string) => Promise<Message>;
  sendThreadReply: (
    text: string,
    currentUserId: string,
    channelId: string,
    parentTimestamp: string
  ) => Promise<void>;
  createIMChannel: (user: User) => Promise<Channel>;
}
