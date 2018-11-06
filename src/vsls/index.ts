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

const VSLS_CHAT_SERVICE_NAME = "vsls-chat";

export class VslsChatProvider implements IChatProvider {
  liveshare: vsls.LiveShare | undefined;
  sharedService: vsls.SharedService | undefined;
  serviceProxy: vsls.SharedServiceProxy | undefined;
  hostService: VslsHostService | undefined;
  guestService: VslsGuestService | undefined;

  async connect(): Promise<CurrentUser | undefined> {
    const liveshare = await vsls.getApi();

    if (!liveshare) {
      return undefined;
    }

    this.liveshare = liveshare;
    const { id: sessionId } = this.liveshare.session;

    this.liveshare.onDidChangePeers(({ added, removed }) => {
      if (!!this.hostService) {
        this.hostService.updateCachedPeers(added, removed);
        this.hostService.sendJoinedMessages(added);
        this.hostService.sendLeavingMessages(removed);
      }
    });

    this.liveshare.onDidChangeSession(async ({ session }) => {
      // TODO: send ended message when session ends
      const { id: sessionId, role } = session;
      const isSessionActive = !!sessionId;
      let currentUser;

      if (isSessionActive) {
        currentUser = await this.initialize();

        if (!!this.hostService) {
          this.hostService.sendStartedMessage();
        }
      } else {
        await this.clearSession();
      }

      vscode.commands.executeCommand(SelfCommands.LIVE_SHARE_SESSION_CHANGED, {
        isSessionActive,
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
    const liveshare = <vsls.LiveShare>await vsls.getApi();
    const { role, id: sessionId, peerNumber, user } = liveshare.session;

    if (!user || !sessionId) {
      return undefined;
    }

    if (role === vsls.Role.Host) {
      if (!this.sharedService) {
        const sharedService = await liveshare.shareService(
          VSLS_CHAT_SERVICE_NAME
        );

        if (!sharedService) {
          // Not sure why this would happen. We should inform the user here.
          return undefined;
        }

        this.sharedService = sharedService;
        this.hostService = new VslsHostService(this.sharedService, peerNumber);
      }
    } else if (role === vsls.Role.Guest) {
      if (!this.serviceProxy) {
        const serviceProxy = await liveshare.getSharedService(
          VSLS_CHAT_SERVICE_NAME
        );

        if (!serviceProxy) {
          // Not sure why this would happen. We should inform the user here.
          return undefined;
        }

        this.serviceProxy = serviceProxy;
        this.guestService = new VslsGuestService(this.serviceProxy, <vsls.Peer>(
          liveshare.session
        ));
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

  async clearSession() {
    this.hostService = undefined;
    this.guestService = undefined;
    const liveshare = <vsls.LiveShare>await vsls.getApi();
    liveshare.unshareService(VSLS_CHAT_SERVICE_NAME);
    this.sharedService = undefined;
    this.serviceProxy = undefined;
  }

  isConnected(): boolean {
    if (!!this.hostService) {
      return this.hostService.isConnected();
    } else if (!!this.guestService) {
      return this.guestService.isConnected();
    }

    return false;
  }

  fetchUsers(): Promise<Users> {
    if (!!this.hostService) {
      return this.hostService.fetchUsers();
    } else if (!!this.guestService) {
      return this.guestService.fetchUsers();
    }

    return Promise.resolve({});
  }

  async fetchUserInfo(userId: string): Promise<User | undefined> {
    if (!!this.hostService) {
      return this.hostService.fetchUserInfo(userId);
    } else if (!!this.guestService) {
      return this.guestService.fetchUserInfo(userId);
    }
  }

  sendMessage(
    text: string,
    currentUserId: string,
    channelId: string
  ): Promise<void> {
    if (!!this.hostService) {
      return this.hostService.sendMessage(text, currentUserId, channelId);
    } else if (!!this.guestService) {
      return this.guestService.sendMessage(text, currentUserId, channelId);
    }

    return Promise.resolve();
  }

  loadChannelHistory(channelId: string): Promise<ChannelMessages> {
    // There is just one channel at this point
    if (!!this.hostService) {
      return this.hostService.fetchMessagesHistory();
    } else if (!!this.guestService) {
      return this.guestService.fetchMessagesHistory();
    }

    return Promise.resolve({});
  }

  async destroy(): Promise<void> {
    const liveshare = await vsls.getApi();

    if (!!liveshare) {
      return liveshare.unshareService(VSLS_CHAT_SERVICE_NAME);
    }
  }

  getUserPreferences(): Promise<UserPreferences> {
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
