import * as vsls from "vsls";
import { gravatarUrl } from "../utils";

export const VSLS_CHAT_CHANNEL = {
    id: "vsls-channel-id",
    name: "Live Share Chat"
};

export function getVslsChatServiceName(sessionId: string) {
    return `vsls-chat-${sessionId}`
}

export type VslsChatMessage = {
    userId: string;
    text: string;
    timestamp: string;
};

export const toBaseMessage = (raw: VslsChatMessage): Message => {
    return { ...raw, content: undefined, reactions: [], replies: {} };
};

export const toBaseUser = (peerNumber: number, user: vsls.UserInfo): User => {
    const { displayName, emailAddress } = user;
    const avatar = gravatarUrl(emailAddress!);
    return {
        id: peerNumber.toString(),
        name: displayName,
        email: !!emailAddress ? emailAddress : undefined,
        fullName: displayName,
        imageUrl: avatar,
        smallImageUrl: avatar,
        presence: UserPresence.available
    };
};

export const REQUEST_NAME = {
    message: "message",
    fetchUsers: "fetch_users",
    fetchUserInfo: "fetch_user_info",
    fetchMessages: "fetch_messages",
    registerGuest: "register_guest"
};

export const NOTIFICATION_NAME = {
    message: "message"
};
