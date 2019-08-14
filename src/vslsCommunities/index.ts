import * as vscode from "vscode";
import * as gravatar from "gravatar-api";
import { VSLS_COMMUNITIES_EXTENSION_ID, SelfCommands } from "../constants";
import { getExtension } from "../utils";

interface IMessage {
    type: string;
    content: string;
    timestamp: string;
    sender: string;
}

const toMessage = (msg: IMessage) => ({
    timestamp: (Date.parse(msg.timestamp) / 1000.0).toString(),
    userId: msg.sender,
    text: msg.content,
    content: undefined,
    reactions: [],
    replies: {}
});

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class VslsCommunitiesProvider implements IChatProvider {
    isListenerSetup: boolean = false;

    constructor() {
        // Waiting for the extension to get activated
        setTimeout(() => {
            this.setupListeners();
        }, 5000);
    }

    setupListeners() {
        const extension = getExtension(VSLS_COMMUNITIES_EXTENSION_ID);

        if (extension && extension.isActive) {
            const exports = extension.exports;
            exports.setMessageCallback((data: any) => {
                this.onNewMessage(data);
            });
            exports.setCommunityCallback((name: string) => {
                this.onNewCommunity(name);
            });
            exports.setClearMessagesCallback((name: string) => {
                this.onClearMessages(name);
            });
            // exports.setInfoMessageCallback((data: any) => {
            //     this.onInfoMessage(data);
            // });

            this.isListenerSetup = true;
        }
    }

    async getApi() {
        let extension = getExtension(VSLS_COMMUNITIES_EXTENSION_ID)!;

        if (extension.isActive) {
            if (!this.isListenerSetup) {
                this.setupListeners();
            }

            return extension.exports;
        } else {
            await sleep(5000); // Give 5 secs for extension to activate

            extension = getExtension(VSLS_COMMUNITIES_EXTENSION_ID)!;
            return extension.exports;
        }
    }

    async connect(): Promise<CurrentUser | undefined> {
        const api = await this.getApi();

        if (api) {
            const { name, email } = api.getUserInfo();
            return {
                id: email,
                name,
                teams: [],
                currentTeamId: undefined,
                provider: Providers.vslsCommunities
            };
        }
    }

    onNewMessage(data: any) {
        const { name, messages } = data;
        const chatMessages: Message[] = messages.map(toMessage);
        let channelMessages: ChannelMessages = {};
        chatMessages.forEach(msg => {
            channelMessages[msg.timestamp] = msg;
        });
        vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
            channelId: name,
            messages: channelMessages,
            provider: "vslsCommunities"
        });
    }

    onInfoMessage(data: any) {
        const { name, text, user } = data;
        const timestamp = (new Date().valueOf() / 1000.0).toString();
        const channelMessages: ChannelMessages = {
            [timestamp]: {
                timestamp,
                text: `_${text}_`,
                userId: user,
                content: undefined,
                reactions: [],
                replies: {}
            }
        };
        vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
            channelId: name,
            messages: channelMessages,
            provider: "vslsCommunities"
        });
    }

    onNewCommunity(communityName: string) {
        vscode.commands.executeCommand(SelfCommands.VSLS_COMMUNITY_JOINED, {
            name: communityName
        });
    }

    onClearMessages(communityName: string) {
        vscode.commands.executeCommand(SelfCommands.CLEAR_MESSAGES, {
            channelId: communityName,
            provider: "vslsCommunities"
        });
    }

    isConnected(): boolean {
        return this.isListenerSetup;
    }

    async sendMessage(text: string, currentUserId: string, channelId: string) {
        const api = await this.getApi();
        api.sendMessage(channelId, text);
    }

    async fetchUsers(): Promise<Users> {
        const api = await this.getApi();
        const users: User[] = api.getUsers().map(({ name, email }: any) => {
            const avatar = gravatar.imageUrl({
                email,
                parameters: { size: "200", d: "retro" },
                secure: true
            });
            return {
                id: email,
                name,
                email,
                fullName: name,
                imageUrl: avatar,
                smallImageUrl: avatar,
                presence: UserPresence.available
            };
        });
        let usersToSend: Users = {};
        users.forEach(u => {
            usersToSend[u.id] = u;
        });
        return usersToSend;
    }

    async fetchUserInfo(userId: string): Promise<User | undefined> {
        const users = await this.fetchUsers();
        return users[userId];
    }

    async fetchChannels(users: Users): Promise<Channel[]> {
        const api = await this.getApi();
        const communities = api.getCommunities();
        const channels: Channel[] = communities.map((name: string) => ({
            id: name,
            name,
            type: ChannelType.channel,
            readTimestamp: undefined,
            unreadCount: 0
        }));
        return channels;
    }

    async loadChannelHistory(channelId: string) {
        const api = await this.getApi();
        const messages: IMessage[] = await api.getChannelHistory(channelId);
        const chatMessages: Message[] = messages.map(toMessage);
        let channelMessages: ChannelMessages = {};
        chatMessages.forEach(msg => {
            channelMessages[msg.timestamp] = msg;
        });
        return channelMessages;
    }

    subscribePresence(users: Users) {}

    getUserPreferences(): Promise<UserPreferences> {
        return Promise.resolve({});
    }

    async validateToken(): Promise<CurrentUser | undefined> {
        return;
    }

    async fetchChannelInfo(channel: Channel): Promise<Channel | undefined> {
        return undefined;
    }

    async markChannel(
        channel: Channel,
        ts: string
    ): Promise<Channel | undefined> {
        return undefined;
    }

    async fetchThreadReplies(
        channelId: string,
        ts: string
    ): Promise<Message | undefined> {
        return undefined;
    }

    async sendThreadReply(
        text: string,
        currentUserId: string,
        channelId: string,
        parentTimestamp: string
    ) {}

    async updateSelfPresence(
        presence: UserPresence,
        durationInMinutes: number
    ) {
        return undefined;
    }

    async createIMChannel(user: User): Promise<Channel | undefined> {
        return undefined;
    }

    async destroy() {}
}
