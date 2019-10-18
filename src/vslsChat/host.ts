import * as vsls from "vsls";
import { VslsChatMessage, REQUEST_NAME, NOTIFICATION_NAME, toBaseMessage, usersFromPeers } from "./utils";
import { VslsBaseService } from "./base";
import { LIVE_SHARE_INFO_MESSAGES } from "../strings";

interface VslsMessages {
    [timestamp: string]: VslsChatMessage;
}

export class VslsHostService extends VslsBaseService {
    messages: VslsMessages = {};
    cachedPeers: vsls.Peer[] = [];

    constructor(
        private api: vsls.LiveShare,
        private sharedService: vsls.SharedService,
        private currentUser: User,
        private serviceName: string
    ) {
        super();

        sharedService.onDidChangeIsServiceAvailable((available: boolean) => {
            // Service availability changed
            // TODO
        });

        sharedService.onRequest(REQUEST_NAME.message, payload => {
            if (!!payload) {
                const message = payload[0];
                const { userId, text } = message;
                return this.broadcastMessage(userId, text);
            }
        });

        sharedService.onRequest(REQUEST_NAME.fetchUsers, () => {
            return this.fetchUsers();
        });

        sharedService.onRequest(REQUEST_NAME.fetchUserInfo, payload => {
            if (!!payload) {
                const userId = payload[0];
                return this.fetchUserInfo(userId);
            }
        });

        sharedService.onRequest(REQUEST_NAME.fetchMessages, () => {
            return this.fetchMessagesHistory();
        });

        sharedService.onRequest(REQUEST_NAME.registerGuest, payload => {
            if (!!payload) {
                const { peer } = payload[0];
                return this.updateCachedPeers([peer], []);
            }
        });
    }

    async dispose() {
        await this.api.unshareService(this.serviceName);
    }

    isConnected() {
        return !!this.sharedService ? this.sharedService.isServiceAvailable : false;
    }

    sendStartedMessage() {
        return this.broadcastMessage(this.currentUser.id, LIVE_SHARE_INFO_MESSAGES.started);
    }

    sendEndedMessage() {
        return this.broadcastMessage(this.currentUser.id, LIVE_SHARE_INFO_MESSAGES.ended);
    }

    async sendJoinedMessages(peers: vsls.Peer[]) {
        (await usersFromPeers(peers, this.api)).forEach(user => {
            this.broadcastMessage(user.id, LIVE_SHARE_INFO_MESSAGES.joined)
        })
    }

    async sendLeavingMessages(peers: vsls.Peer[]) {
        (await usersFromPeers(peers, this.api)).forEach(user => {
            this.broadcastMessage(user.id, LIVE_SHARE_INFO_MESSAGES.left)
        })
    }

    async fetchUsers(): Promise<Users> {
        const users: Users = {};
        users[this.currentUser.id] = this.currentUser;

        const peersAsUsers = await usersFromPeers(this.api.peers, this.api);
        peersAsUsers.forEach(user => {
            users[user.id] = user;
        })
        return users;
    }

    async fetchUserInfo(userId: string): Promise<User | undefined> {
        // userId could be current user or one of the peers
        let userFound: User | undefined;

        if (this.currentUser.id === userId) {
            return this.currentUser;
        }

        const users = await usersFromPeers(this.api.peers, this.api);
        userFound = users.find(user => user.id === userId)

        if (userFound) {
            return userFound;
        }

        // Finally, let's check cached peers
        // In some cases, vsls seems to be returning stale data, and
        // so we cache whatever we know locally.
        const cachedUsers = await usersFromPeers(this.cachedPeers, this.api);
        userFound = cachedUsers.find(user => user.id === userId);

        if (userFound) {
            return userFound;
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

    updateCachedPeers(addedPeers: vsls.Peer[], removedPeers: vsls.Peer[]) {
        const updated = [...this.cachedPeers, ...addedPeers, ...removedPeers];
        const uniquePeers = updated.filter(
            (peer, index, self) => index === self.findIndex(t => t.peerNumber === peer.peerNumber)
        );
        this.cachedPeers = uniquePeers;
    }
}
