interface IChatProvider {
  validateToken: () => Promise<CurrentUser | undefined>;
  fetchUsers: () => Promise<Users>;
  fetchUserInfo: (userId: string) => Promise<User | undefined>;
  fetchChannels: (users: Users) => Promise<Channel[]>;
  fetchChannelInfo: (channel: Channel) => Promise<Channel | undefined>;
  loadChannelHistory: (channelId: string) => Promise<ChannelMessages>;
  getUserPreferences: () => Promise<UserPreferences | undefined>;
  markChannel: (channel: Channel, ts: string) => Promise<Channel | undefined>;
  fetchThreadReplies: (
    channelId: string,
    ts: string
  ) => Promise<Message | undefined>;
  sendMessage: (
    text: string,
    currentUserId: string,
    channelId: string
  ) => Promise<void>;
  sendThreadReply: (
    text: string,
    currentUserId: string,
    channelId: string,
    parentTimestamp: string
  ) => Promise<void>;
  connect: () => Promise<CurrentUser | undefined>;
  isConnected: () => boolean;
  updateSelfPresence: (
    presence: UserPresence,
    durationInMinutes: number
  ) => Promise<UserPresence | undefined>;
  subscribePresence: (users: Users) => void;
  createIMChannel: (user: User) => Promise<Channel | undefined>;
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
  vsls = "vsls"
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
  currentProvider: string;
  messages: ChannelMessages;
  users: Users;
  channel: Channel;
  currentUser: CurrentUser;
  statusText: string;
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
  lastChannelId: string | undefined;
  channels: Channel[];
  currentUserInfo: CurrentUser | undefined;
  users: Users;
  existingVersion: string | undefined;

  // New fields
  updateUsers: any;
  updateChannels: any;
  updateCurrentUser: any;
  updateLastChannelId: any;
}

interface IManager {
  isTokenInitialized: boolean;
  store: IStore;
  // messages: Messages;
  isAuthenticated: (provider: string) => boolean;
  getChannel: (
    provider: string,
    channelId: string | undefined
  ) => Channel | undefined;
  getIMChannel: (user: User) => Channel | undefined;
  getChannelLabels: (provider: string) => any;
  getUnreadCount: (provider: string, channel: Channel) => number;
  getCurrentWorkspaceName: () => string | undefined;
  getUserPresence: (userId: string) => UserPresence | undefined;
  getCurrentPresence: () => UserPresence | undefined;
  getCurrentProvider: () => string;
  // updateMessages: (channelId: string, newMessages: ChannelMessages) => void;
  // loadChannelHistory: (channelId: string) => Promise<void>;
  // updateReadMarker: () => void;
  // updatePresenceForUser: (userId: string, presence: UserPresence) => void;
  // addReaction: (
  //   channelId: string,
  //   msgTimestamp: string,
  //   userId: string,
  //   reactionName: string
  // ) => void;
  // removeReaction: (
  //   channelId: string,
  //   msgTimestamp: string,
  //   userId: string,
  //   reactionName: string
  // ) => void;

  // New fields
  viewsManager: any;
  vslsContactProvider: any;
  updateAllUI: any;
  getMessages: (provider: string) => Messages;
}

interface ChatArgs {
  channel?: Channel;
  user?: User;
  source: EventSource;
}

const enum EventSource {
  status = "status_item",
  command = "command_palette",
  activity = "activity_bar",
  info = "info_message",
  slash = "slash_command"
}

const enum EventType {
  extensionInstalled = "extension_installed",
  viewOpened = "webview_opened",
  messageSent = "message_sent",
  vslsShared = "vsls_shared",
  tokenConfigured = "token_configured",
  channelChanged = "channel_changed",
  authStarted = "auth_started"
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
