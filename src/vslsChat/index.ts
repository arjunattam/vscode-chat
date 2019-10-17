import * as vscode from "vscode";
import * as vsls from "vsls";
import { VSLS_CHAT_CHANNEL, getVslsChatServiceName, isLiveshareProvider, toBaseMessage, userFromContact, defaultAvatar, onPropertyChanged, toDirectMessage } from "./utils";
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
    imChannels: Channel[] = [];
    currentUser: User | undefined;

    constructor(private store: IStore) { 
        // We are passing the store in here to be able to store message history
    }

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

        return new Promise((resolve, reject) => {
            // @ts-ignore (session is a readonly property)
            liveshare.session = onPropertyChanged(liveshare.session, "user", () => {
                resolve(this.getCurrentUser(liveshare))
            });
        })
    }

    private initializePresenceProvider(presenceProvider: any) {
        this.presenceProvider = presenceProvider.provider;

        this.presenceProvider.onNotified(async ({ type, body }: any) => {
            if (type === Methods.NotifyMessageReceivedName) {
                const { body: msgBody } = body;
                const { id: senderId, email: senderEmail } = msgBody.user;

                // Check if this is a known IM channel (since we are building them on-the-fly)
                let foundChannel = this.imChannels.find(channel => channel.id === senderId)
                if (!foundChannel) {
                    // This is an IM channel we haven't seen before --> we want to update it in the store
                    // so we can get notifications etc. wired up for it.
                    const { contacts } = await this.liveshare!.getContacts([senderEmail]);
                    await this.createIMChannel(userFromContact(contacts[senderEmail]));
                    this.store.updateChannels('vsls', (await this.fetchChannels({})))
                }

                this.updateDirectMessageUI(msgBody, senderId)
            }
        })
    }

    private updateDirectMessageUI(newMessageBody: any, channelId: string) {
        let newMessages: ChannelMessages = {};
        const { timestamp } = newMessageBody;
        newMessages[timestamp] = toDirectMessage(newMessageBody);
        vscode.commands.executeCommand(
            SelfCommands.UPDATE_MESSAGES, {
                channelId,
                messages: newMessages,
                provider: 'vsls'
            }
        )
    }

    private async sendDirectMessage(targetContactId: string, type: string, body: any = {}) {
        const message = { type, body, targetContactId }

        if (this.presenceProvider) {
            await this.presenceProvider.requestAsync(Methods.RequestSendMessageName, message)

            // Once the message is sent, we want to also update the UI
            this.updateDirectMessageUI(body, targetContactId);
        }
    }

    private getCurrentUser(api: vsls.LiveShare): CurrentUser {
        const user = api.session.user!
        this.currentUser = {
            id: user.id,
            email: user.emailAddress!,
            name: user.displayName,
            fullName: user.displayName,
            presence: UserPresence.unknown,
            // TODO: Instead of using default avatar, we can use the
            // avatar stored in the LS contact model. Unfortunately, the avatar
            // is not available in the LS user model, so we would need to
            // convert the user into the contact.
            imageUrl: defaultAvatar(user.emailAddress!),
            smallImageUrl: defaultAvatar(user.emailAddress!)
        }
        return {
            id: user.id,
            name: user.displayName,
            teams: [{
                id: VSLS_CHAT_CHANNEL.id,
                name: VSLS_CHAT_CHANNEL.name
            }],
            currentTeamId: VSLS_CHAT_CHANNEL.id,
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

    async fetchUsers(): Promise<Users> {
        let currentUser: Users = {}
        let serviceUsers: Users = {}

        if (this.currentUser) {
            currentUser[this.currentUser.id] = { ...this.currentUser }
        }

        if (!!this.hostService) {
            serviceUsers = await this.hostService.fetchUsers();
        } else if (!!this.guestService) {
            serviceUsers = await this.guestService.fetchUsers();
        }

        return Promise.resolve({
            ...currentUser,
            ...serviceUsers
        });
    }

    async fetchUserInfo(userId: string): Promise<User | undefined> {
        if (!!this.hostService) {
            return this.hostService.fetchUserInfo(userId);
        } else if (!!this.guestService) {
            return this.guestService.fetchUserInfo(userId);
        }
    }

    sendMessage(text: string, currentUserId: string, channelId: string): Promise<void> {
        const isChannelMessage = channelId === VSLS_CHAT_CHANNEL.id;

        if (!isChannelMessage) {
            // This is a direct message -> sent via presence provider
            // channelId is the user id on the LS contact model
            const body = {
                user: {
                    id: currentUserId,
                    email: this.currentUser ? this.currentUser.email : undefined
                },
                text,
                timestamp: (+new Date() / 1000.0).toString()
            };
            return this.sendDirectMessage(channelId, "vsls_dm", body)
        } else {
            // This is a channel message -> sent via host/guest services
            if (!!this.hostService) {
                return this.hostService.sendMessage(text, currentUserId, channelId);
            } else if (!!this.guestService) {
                return this.guestService.sendMessage(text, currentUserId, channelId);
            }
        }

        return Promise.resolve();
    }

    async loadChannelHistory(channelId: string): Promise<ChannelMessages> {
        const isSessionChannel = channelId === VSLS_CHAT_CHANNEL.id;

        if (isSessionChannel) {
            if (!!this.hostService) {
                return this.hostService.fetchMessagesHistory();
            } else if (!!this.guestService) {
                return this.guestService.fetchMessagesHistory();
            }
        } else {
            return this.store.getMessageHistoryForChannel(channelId);
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
        const defaultChannel: Channel = {
            id: VSLS_CHAT_CHANNEL.id,
            name: VSLS_CHAT_CHANNEL.name,
            type: ChannelType.channel,
            readTimestamp: (+new Date() / 1000.0).toString(),
            unreadCount: 0
        };
        return [defaultChannel, ...this.imChannels];
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
        // We are saving a slightly old readTimestamp, so that the unread 
        // notification can be triggered correctly. As the IM channels can be created
        // at the same time as the message is received, we don't want to simply do a now()
        const oneMinuteAgo = (+new Date() / 1000.0) - 60;
        const channel = {
            id: user.id,
            name: user.fullName,
            type: ChannelType.im,
            readTimestamp: oneMinuteAgo.toString(),
            unreadCount: 0
        }

        // Save imChannels so fetchChannels can return them
        if (!this.imChannels.find(item => item.id === user.id)) {
            this.imChannels = [...this.imChannels, channel]
        }

        return channel;
    }

    updateSelfPresence(): any {
        // no-op
    }
}
