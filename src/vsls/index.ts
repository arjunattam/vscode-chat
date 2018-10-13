import * as vscode from "vscode";
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
import { VSLS_SERVICE_NAME, VSLS_CHANNEL } from "./utils";
import { VslsHostService } from "./host";
import { VslsGuestService } from "./guest";
import { SelfCommands } from "../constants";

const VSLS_TOKEN_STRING = "vsls-placeholder-token";

export class VslsChatProvider implements IChatProvider {
  liveshare: vsls.LiveShare;
  hostService: VslsHostService;
  guestService: VslsGuestService;

  async connect(): Promise<CurrentUser> {
    this.liveshare = await vsls.getApiAsync();
    const { id: sessionId } = this.liveshare.session;

    this.liveshare.onDidChangePeers(({ added, removed }) => {
      if (!!this.hostService) {
        this.hostService.updateCachedPeers(added, removed);
      }

      const { role } = this.liveshare.session;

      if (role === vsls.Role.Host) {
        this.hostService.sendJoinedMessages(added);
        this.hostService.sendLeavingMessages(removed);
      }
    });

    this.liveshare.onDidChangeSession(async ({ session }) => {
      const isActive = !!session.id;
      let currentUser;

      if (isActive) {
        currentUser = await this.initialize();
        const { role } = session;

        if (role === vsls.Role.Host) {
          this.hostService.sendStartedMessage();
        }
      }

      vscode.commands.executeCommand(SelfCommands.LIVE_SHARE_SESSION_CHANGED, {
        isActive,
        currentUser
      });
    });

    if (!!sessionId) {
      // TODO: do we need this?
      return this.initialize();
    }
  }

  async initialize(): Promise<CurrentUser> {
    // This assumes live share session is available
    const { role, id: sessionId, peerNumber, user } = this.liveshare.session;

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
    if (!!this.liveshare) {
      const { role } = this.liveshare.session;

      if (role === vsls.Role.Host) {
        return this.hostService.fetchUsers();
      } else if (role === vsls.Role.Guest) {
        return this.guestService.fetchUsers();
      }
    }
  }

  fetchUserInfo(userId: string): Promise<User> {
    if (!!this.liveshare) {
      const { role } = this.liveshare.session;

      if (role === vsls.Role.Host) {
        return this.hostService.fetchUserInfo(userId);
      } else if (role === vsls.Role.Guest) {
        return this.guestService.fetchUserInfo(userId);
      }
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
    if (!!this.liveshare) {
      const { role } = this.liveshare.session;

      if (role === vsls.Role.Host) {
        return this.hostService.fetchMessagesHistory();
      } else if (role === vsls.Role.Guest) {
        return this.guestService.fetchMessagesHistory();
      }
    }
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
    const readTimestamp = (+new Date() / 1000.0).toString();
    const defaultChannel: Channel = {
      id: VSLS_CHANNEL.id,
      name: VSLS_CHANNEL.name,
      type: ChannelType.channel,
      readTimestamp,
      unreadCount: 0
    };
    return Promise.resolve([defaultChannel]);
  }

  fetchChannelInfo(channel: Channel): Promise<Channel> {
    return Promise.resolve({ ...channel });
  }

  subscribePresence(users: Users) {}

  markChannel(channel: Channel, ts: string): Promise<Channel> {
    return Promise.resolve({ ...channel, readTimestamp: ts, unreadCount: 0 });
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
