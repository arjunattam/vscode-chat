import * as vscode from "vscode";
import * as vsls from "vsls";
import { VSLS_CHAT_CHANNEL, getVslsChatServiceName, isLiveshareProvider, onPropertyChanged } from "./utils";
import { Methods } from "vsls/vsls-contactprotocol.js";
import { VslsHostService } from "./host";
import { VslsGuestService } from "./guest";
import { SelfCommands } from "../constants";
import * as str from "../strings";
import Logger from "../logger";

export class VslsChatProvider implements IChatProvider {
    liveshare: vsls.LiveShare | undefined;
    hostService: VslsHostService | undefined;
    guestService: VslsGuestService | undefined;
    presenceProvider: any;

    async connect(): Promise<CurrentUser | undefined> {
        // This method sets up the chat provider to listen for changes in vsls session
        const liveshare = await vsls.getApi();

        if (!liveshare) {
            Logger.log("vsls not found, required to initialize chat");
            return undefined;
        }

        if (!!this.liveshare) {
            // We have already initialized, and we don't want to
            // attach the event listeners again.
            // (This overrides the connect() logic inside ChatProviderManager)
            if (this.liveshare.session.user) {
                return this.getCurrentUser(this.liveshare)
            }
        }

        this.liveshare = liveshare;

        this.liveshare.onDidChangePeers(({ added, removed }) => {
            if (!!this.hostService) {
                this.hostService.updateCachedPeers(added, removed);
                this.hostService.sendJoinedMessages(added);
                this.hostService.sendLeavingMessages(removed);
            }
        });

        this.liveshare.onDidChangeSession(async ({ session }) => {
            const { id: sessionId, role } = session;
            const isSessionActive = !!sessionId;
            let currentUser;

            if (isSessionActive) {
                currentUser = await this.initializeChatService();

                if (!!this.hostService) {
                    this.hostService.sendStartedMessage();
                }
            } else {
                if (!!this.hostService) {
                    this.hostService.sendEndedMessage();
                }

                await this.clearSession();
            }

            vscode.commands.executeCommand(SelfCommands.LIVE_SHARE_SESSION_CHANGED, {
                isSessionActive,
                currentUser
            });
        });

        // Initialize our link to the LS presence provider to send/receive DMs
        (<any>this.liveshare).onPresenceProviderRegistered((e: any) => {
            if (isLiveshareProvider(e.added)) {
                this.initializePresenceProvider(e.added)
            };
        })

        const registeredProviders = (<any>this.liveshare).presenceProviders;
        const provider = registeredProviders.find((p: any) => isLiveshareProvider(p));

        if (provider) {
            this.initializePresenceProvider(provider);
        }
    }

    private initializePresenceProvider(provider: any) {
        this.presenceProvider = provider.provider;

        this.presenceProvider.onNotified(async (e: any) => {
            if (e.type === Methods.NotifyMessageReceivedName) {
                console.log(e);
            }
        })
    }

    private async sendDirectMessage(targetContactId: string, type: string, body: any = {}) {
        const message = { type, body, targetContactId }

        if (this.presenceProvider) {
            await this.presenceProvider.requestAsync(
                Methods.RequestSendMessageName, message
            )
        }
    }

    private getCurrentUser(api: vsls.LiveShare) {
        const user = api.session.user!
        const sessionId = api.session.id || undefined;
        return {
            id: user.id,
            name: user.displayName,
            teams: sessionId ? [{
                id: sessionId, name: VSLS_CHAT_CHANNEL.name
            }]: [],
            currentTeamId: sessionId,
            provider: Providers.vsls
        }
    }

    async initializeChatService(): Promise<CurrentUser | undefined> {
        // This assumes live share session is available
        const liveshare = <vsls.LiveShare>await vsls.getApi();
        const { role, id: sessionId, peerNumber, user } = liveshare.session;

        if (!user || !sessionId) {
            return undefined;
        }

        const serviceName = getVslsChatServiceName(sessionId);

        if (role === vsls.Role.Host) {
            const sharedService = await liveshare.shareService(serviceName);

            if (!sharedService) {
                throw new Error("Error sharing service for Live Share Chat.");
            }

            this.hostService = new VslsHostService(liveshare, sharedService, peerNumber, serviceName);
        } else if (role === vsls.Role.Guest) {
            const serviceProxy = await liveshare.getSharedService(serviceName);

            if (!serviceProxy) {
                throw new Error("Error getting shared service for Live Share Chat.");
            }

            if (!serviceProxy.isServiceAvailable) {
                vscode.window.showWarningMessage(str.NO_LIVE_SHARE_CHAT_ON_HOST);
                return;
            } else {
                this.guestService = new VslsGuestService(liveshare, serviceProxy, <vsls.Peer>liveshare.session);
            }
        }

        return this.getCurrentUser(liveshare)
    }

    async clearSession() {
        if (!!this.hostService) {
            await this.hostService.dispose();
        }

        if (!!this.guestService) {
            await this.guestService.dispose();
        }

        this.hostService = undefined;
        this.guestService = undefined;
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

    sendMessage(text: string, currentUserId: string, channelId: string): Promise<void> {
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
        if (!!this.hostService) {
            await this.hostService.dispose();
        }
    }

    getUserPreferences(): Promise<UserPreferences> {
        return Promise.resolve({});
    }

    async fetchChannels(users: Users): Promise<Channel[]> {
        const readTimestamp = (+new Date() / 1000.0).toString();
        const defaultChannel: Channel = {
            id: VSLS_CHAT_CHANNEL.id,
            name: VSLS_CHAT_CHANNEL.name,
            type: ChannelType.channel,
            readTimestamp,
            unreadCount: 0
        };
        return [defaultChannel];
    }

    fetchChannelInfo(channel: Channel): Promise<Channel> {
        return Promise.resolve({ ...channel });
    }

    subscribePresence(users: Users) {}

    markChannel(channel: Channel, ts: string): Promise<Channel> {
        return Promise.resolve({
            ...channel,
            readTimestamp: ts,
            unreadCount: 0
        });
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

    sendThreadReply(text: string, currentUserId: string, channelId: string, parentTimestamp: string): Promise<void> {
        return Promise.resolve();
    }

    async createIMChannel(user: User): Promise<Channel | undefined> {
        return {
            id: user.id,
            name: user.fullName,
            type: ChannelType.im,
            readTimestamp: undefined,
            unreadCount: 0
        };
    }

    updateSelfPresence(): any {
        // no-op
    }
}
