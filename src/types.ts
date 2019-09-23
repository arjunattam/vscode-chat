interface IChatProvider {
    validateToken: () => Promise<CurrentUser | undefined>;
    fetchUsers: () => Promise<Users>;
    fetchUserInfo: (userId: string) => Promise<User | undefined>;
    fetchChannels: (users: Users) => Promise<Channel[]>;
    fetchChannelInfo: (channel: Channel) => Promise<Channel | undefined>;
    loadChannelHistory: (channelId: string) => Promise<ChannelMessages>;
    getUserPreferences: () => Promise<UserPreferences | undefined>;
    markChannel: (channel: Channel, ts: string) => Promise<Channel | undefined>;
    fetchThreadReplies: (channelId: string, ts: string) => Promise<Message | undefined>;
    sendMessage: (text: string, currentUserId: string, channelId: string) => Promise<void>;
    sendThreadReply: (text: string, currentUserId: string, channelId: string, parentTimestamp: string) => Promise<void>;
    connect: () => Promise<CurrentUser | undefined>;
    isConnected: () => boolean;
    updateSelfPresence: (presence: UserPresence, durationInMinutes: number) => Promise<UserPresence | undefined>;subscribePresence: (users: Users) => void; createIMChannel: (user: User) => Promise<Channel | undefined>;
    destroy: () => Promise<void>;
}

const enum UserPresence {
    unknown = "unknown",
    available = "available",
    idle = "idle",
    doNotDisturb = "doNotDisturb",
    invisible = "invisible",
    offline = "offline"
}

interface User {
    id: string;
    name: string;
    email?: string; // Discord does not have emails, hence the ?
    fullName: string;
    internalName?: string; // Used by slack provider to associate DMs
    imageUrl: string;
    smallImageUrl: string;
    presence: UserPresence;
    isBot?: boolean;
    isDeleted?: boolean;
    roleName?: string;
}

interface UserPreferences {
    mutedChannels?: string[];
}

const enum Providers {
    slack = "slack",
    discord = "discord",
    vsls = "vsls",
    vslsSpaces = "vslsSpaces"
}

interface CurrentUser {
    id: string;
    name: string;
    teams: Team[];
    currentTeamId: string | undefined;
    provider: Providers;
}

interface Team {
    // Team represents workspace for Slack, guild for Discord
    id: string;
    name: string;
}

interface Users {
    [id: string]: User;
}

interface MessageAttachment {
    name: string;
    permalink: string;
}

interface MessageContent {
    author: string;
    authorIcon?: string;
    pretext: string;
    title: string;
    titleLink: string;
    text: string;
    textHTML?: string;
    footer: string;
    footerHTML?: string;
    borderColor?: string;
}

interface MessageReaction {
    name: string;
    count: number;
    userIds: string[];
}

interface MessageReply {
    userId: string;
    timestamp: string;
    text?: string;
    attachment?: MessageAttachment;
    textHTML?: string;
}

interface MessageReplies {
    [timestamp: string]: MessageReply;
}

interface Message {
    timestamp: string;
    userId: string;
    text: string;
    textHTML?: string;
    isEdited?: Boolean;
    attachment?: MessageAttachment;
    content: MessageContent | undefined;
    reactions: MessageReaction[];
    replies: MessageReplies;
    // TODO - add
    // subscribed (for threads)
}

interface ChannelMessages {
    [timestamp: string]: Message;
}

interface ChannelMessagesWithUndefined {
    [timestamp: string]: Message | undefined;
}

interface Messages {
    [channelId: string]: ChannelMessages;
}

const enum ChannelType {
    channel = "channel",
    group = "group",
    im = "im"
}

interface Channel {
    id: string;
    name: string;
    type: ChannelType;
    readTimestamp: string | undefined;
    unreadCount: number;
    categoryName?: string; // for Discord
}

interface ChannelLabel {
    channel: Channel;
    providerName: string;
    teamName: string;
    unread: number;
    label: string;
    presence: UserPresence;
}

const enum MessageType {
    text = "text",
    thread_reply = "thread_reply",
    command = "command",
    link = "link",
    internal = "internal"
}

interface ExtensionMessage {
    type: MessageType;
    text: string;
}

interface UIMessage {
    fontFamily: string;
    fontSize: string;
    provider: string;
    messages: ChannelMessages;
    users: Users;
    channel: Channel;
    currentUser: CurrentUser;
    statusText: string;
    // atMentions: User[];
}

interface UIMessageDateGroup {
    groups: UIMessageGroup[];
    date: string;
}

interface UIMessageGroup {
    messages: Message[];
    userId: string;
    user: User;
    minTimestamp: string;
    key: string;
}

interface IStore {
    installationId: string | undefined; // TODO: remove undefined
    existingVersion: string | undefined;
    generateInstallationId: () => string;
    getCurrentUser: (provider: string) => CurrentUser | undefined;
    getCurrentUserForAll: () => CurrentUser[];
    getUsers: (provider: string) => Users;
    getUser: (provider: string, userId: string) => User | undefined;
    getChannels: (provider: string) => Channel[];
    getLastChannelId: (provider: string) => string | undefined;
    updateUsers: (provider: string, users: Users) => Thenable<void>;
    updateUser: (provider: string, userId: string, user: User) => void;
    updateChannels: (provider: string, channels: Channel[]) => Thenable<void>;
    updateCurrentUser: (provider: string, userInfo: CurrentUser | undefined) => Thenable<void>;
    updateLastChannelId: (provider: string, channelId: string | undefined) => Thenable<void>;
    clearProviderState: (provider: string) => Promise<void>;
    updateExtensionVersion: (version: string) => Thenable<void>;
}

interface IManager {
    isTokenInitialized: boolean;
    store: IStore;
    vslsContactProvider: any;
    isAuthenticated: (provider: string) => boolean;
    getChannel: (provider: string, channelId: string | undefined) => Channel | undefined;
    getIMChannel: (provider: string, user: User) => Channel | undefined;
    getChannelLabels: (provider: string) => any;
    getUnreadCount: (provider: string, channel: Channel) => number;
    getCurrentUserFor: (provider: string) => CurrentUser | undefined;
    getUserPresence: (provider: string, userId: string) => UserPresence | undefined;
    getCurrentUserPresence: (provider: string) => UserPresence | undefined;
    updateAllUI: () => void;
    updateTreeViewsForProvider: (provider: string) => void;
    updateStatusItemsForProvider: (provider: string) => void;
    updateWebviewForProvider: (provider: string, channelId: string) => void;
    getMessages: (provider: string) => Messages;
}

interface IViewsManager {
    updateTreeViews: (provider: string) => void;
    updateWebview: (provider: string) => void;
    updateStatusItem: (provider: string, team: Team) => void;
}

interface ChatArgs {
    channelId?: string;
    user?: User;
    providerName: string;
    source: EventSource;
}

const enum EventSource {
    status = "status_item",
    command = "command_palette",
    activity = "activity_bar",
    info = "info_message",
    slash = "slash_command",
    vslsContacts = "vsls_contacts_panel",
    vslsStarted = "vsls_started"
}

const enum EventType {
    extensionInstalled = "extension_installed",
    viewOpened = "webview_opened",
    messageSent = "message_sent",
    vslsShared = "vsls_shared",
    vslsStarted = "vsls_started",
    vslsEnded = "vsls_ended",
    tokenConfigured = "token_configured",
    channelChanged = "channel_changed",
    authStarted = "auth_started",
    activationStarted = "activation_started",
    activationEnded = "activation_ended",
}

interface EventProperties {
    provider: string | undefined;
    source: EventSource | undefined;
    channel_type: ChannelType | undefined;
}

interface TelemetryEvent {
    type: EventType;
    time: Date;
    properties: EventProperties;
}

interface ChatTreeNode {
    label: string;
    channel: Channel | undefined;
    user: User | undefined;
    team: Team | undefined;
    isCategory: boolean;
    presence: UserPresence;
    providerName: string;
}

type InitialState = {
    provider: string;
    teamId: string | undefined;
};
