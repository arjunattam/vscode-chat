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
import { VSLS_CHAT_CHANNEL } from "./utils";
import { VslsHostService } from "./host";
import { VslsGuestService } from "./guest";
import { SelfCommands } from "../constants";

const VSLS_SERVICE_NAME = "vsls-chat";

export class VslsChatProvider implements IChatProvider {
  liveshare: vsls.LiveShare;
  sharedService: vsls.SharedService;
  serviceProxy: vsls.SharedServiceProxy;
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
      // This is called when we are on slack/discord, and the
      // `Chat with VS Live Share participants` command is executed
      const currentUser = await this.initialize();
      vscode.commands.executeCommand(SelfCommands.LIVE_SHARE_SESSION_CHANGED, {
        isActive: true,
        currentUser
      });
      return currentUser;
    }
  }

  async initialize(): Promise<CurrentUser | undefined> {
    // This assumes live share session is available
    const { role, id: sessionId, peerNumber, user } = this.liveshare.session;

    if (!user || !sessionId) {
      return;
    }

    if (role === vsls.Role.Host) {
      if (!this.sharedService) {
        const sharedService = await this.liveshare.shareService(
          VSLS_SERVICE_NAME
        );

        if (!sharedService) {
          // sharedService can be null when experimental flag is off
          return undefined;
        }

        this.sharedService = sharedService;
        this.sharedService.onDidChangeIsServiceAvailable(nowAvailable => {
          console.log("change service", nowAvailable);
        });

        this.hostService = new VslsHostService(
          this.liveshare,
          this.sharedService
        );
      }
    } else if (role === vsls.Role.Guest) {
      if (!this.serviceProxy) {
        const serviceProxy = await this.liveshare.getSharedService(
          VSLS_SERVICE_NAME
        );

        if (!serviceProxy) {
          return undefined;
        }

        this.serviceProxy = serviceProxy;
        this.serviceProxy.onDidChangeIsServiceAvailable(async nowAvailable => {
          console.log("Availability changed to", nowAvailable);
        });

        this.guestService = new VslsGuestService(
          this.liveshare,
          this.serviceProxy
        );
      }
    }

    const sessionTeam: Team = {
      id: sessionId,
      name: sessionId
    };

    return {
      id: peerNumber.toString(),
      name: user.displayName,
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

    return false;
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

    return Promise.resolve({});
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

    return Promise.resolve();
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

    return Promise.resolve({});
  }

  destroy(): Promise<void> {
    return this.liveshare.unshareService(VSLS_SERVICE_NAME);
  }

  getUserPrefs(): Promise<UserPreferences> {
    return Promise.resolve({});
  }

  fetchChannels(users: Users): Promise<Channel[]> {
    const readTimestamp = (+new Date() / 1000.0).toString();
    const defaultChannel: Channel = {
      id: VSLS_CHAT_CHANNEL.id,
      name: VSLS_CHAT_CHANNEL.name,
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

  async validateToken(): Promise<CurrentUser | undefined> {
    // This will never be called, since vsls does not have a token configuration step
    return undefined;
  }

  async fetchThreadReplies(channelId: string, ts: string): Promise<Message> {
    return {
      timestamp: ts,
      userId: "",
      text: "",
      content: undefined,
      reactions: [],
      replies: {}
    };
  }

  sendThreadReply(
    text: string,
    currentUserId: string,
    channelId: string,
    parentTimestamp: string
  ): Promise<void> {
    return Promise.resolve();
  }

  async createIMChannel(user: User): Promise<Channel | undefined> {
    return undefined;
  }
}
