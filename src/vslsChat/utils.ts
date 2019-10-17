import * as vsls from "vsls";
import * as gravatar from "gravatar-api";

export const VSLS_CHAT_CHANNEL = {
    id: "vsls-channel-id",
    name: "Live Share Chat"
};

export function getVslsChatServiceName(sessionId: string) {
    return `vsls-chat-${sessionId}`;
}

export type VslsChatMessage = {
    userId: string;
    text: string;
    timestamp: string;
};

export const toBaseMessage = (raw: VslsChatMessage): Message => {
    return { ...raw, content: undefined, reactions: [], replies: {} };
};

export const toDirectMessage = (raw: any): Message => {
    return { ...raw, content: undefined, reactions: [], replies: {}, userId: raw.user.id };
}

export const defaultAvatar = (email: string) => {
    return gravatar.imageUrl({
        email: email,
        parameters: { size: "200", d: "retro" },
        secure: true
    });
};

export const toBaseUser = (peerNumber: number, user: vsls.UserInfo): User => {
    const { displayName, emailAddress } = user;
    return {
        id: peerNumber.toString(),
        name: displayName,
        email: !!emailAddress ? emailAddress : undefined,
        fullName: displayName,
        imageUrl: defaultAvatar(emailAddress!),
        smallImageUrl: defaultAvatar(emailAddress!),
        presence: UserPresence.available
    };
};

export const userFromContact = (contact: vsls.Contact): User => {
    return {
        id: contact.id,
        email: contact.email,
        name: contact.displayName!,
        fullName: contact.displayName!,
        // TODO: fallback to using the defaultAvatar if this is null
        imageUrl: contact.avatarUri!,
        smallImageUrl: contact.avatarUri!,
        // TODO: Pick accurate presence from contact?
        // (Not the end of the world if we don't, since the LS presence
        //  UI is owned by the LS extension, and so this value is never used.)
        presence: UserPresence.unknown 
    }
}

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

const LIVESHARE_PRESENCE_PROVIDER_ID = "LivesharePresence";

export const isLiveshareProvider = (provider: any) => {
    return provider.serviceId === LIVESHARE_PRESENCE_PROVIDER_ID;
};

export const onPropertyChanged = (object: any, propertyName: string, onChange: any) => {
    const handler = {
        defineProperty(target: any, property: any, descriptor: any) {
            const result = Reflect.defineProperty(target, property, descriptor);
            if (property === propertyName) {
                onChange();
            }

            return result;
        },
        deleteProperty(target: any, property: any) {
            const result = Reflect.deleteProperty(target, property);
            if (property === propertyName) {
                onChange();
            }
            return result;
        }
    };

    return new Proxy(object, handler);
};
