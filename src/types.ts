export interface IChatProvider {
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
  connect: () => Promise<CurrentUser>;
  isConnected: () => boolean;
  subscribePresence: (users: Users) => void;
  createIMChannel: (user: User) => Promise<Channel | undefined>;
  destroy: () => Promise<void>;
}

export interface User {
  id: string;
  name: string;
  fullName: string;
  internalName?: string; // Used by slack provider to associate DMs
  imageUrl: string;
  smallImageUrl: string;
  isOnline: boolean;
  isBot?: boolean;
  isDeleted?: boolean;
  roleName?: string;
}

export interface UserPreferences {
  mutedChannels?: string[];
}

export enum Providers {
  slack = "slack",
  discord = "discord",
  vsls = "vsls"
}

export interface CurrentUser {
  id: string;
  name: string;
  // token: string;
  teams: Team[];
  currentTeamId: string | undefined;
  provider: Providers;
}

export interface Team {
  // Team represents workspace for Slack, guild for Discord
  id: string;
  name: string;
}

export interface Users {
  [id: string]: User;
}

interface MessageAttachment {
  name: string;
  permalink: string;
}

export interface MessageContent {
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

export interface MessageReply {
  userId: string;
  timestamp: string;
  text?: string;
  attachment?: MessageAttachment;
  textHTML?: string;
}

export interface MessageReplies {
  [timestamp: string]: MessageReply;
}

export interface Message {
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

export interface ChannelMessages {
  [timestamp: string]: Message;
}

export interface ChannelMessagesWithUndefined {
  [timestamp: string]: Message | undefined;
}

export interface Messages {
  [channelId: string]: ChannelMessages;
}

export enum ChannelType {
  channel = "channel",
  group = "group",
  im = "im"
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  readTimestamp: string | undefined;
  unreadCount: number;
  categoryName?: string; // for Discord
}

export interface ChannelLabel {
  channel: Channel;
  unread: number;
  label: string;
  isOnline: boolean;
}

enum MessageType {
  text = "text",
  thread_reply = "thread_reply",
  command = "command",
  link = "link",
  internal = "internal"
}

export interface ExtensionMessage {
  type: MessageType;
  text: string;
}

export interface UIMessage {
  messages: ChannelMessages;
  users: Users;
  channel: Channel;
  currentUser: CurrentUser;
  statusText: string;
}

export interface UIMessageDateGroup {
  groups: UIMessageGroup[];
  date: string;
}

export interface UIMessageGroup {
  messages: Message[];
  userId: string;
  user: User;
  minTimestamp: string;
  key: string;
}

export interface IStore {
  installationId: string | undefined; // TODO: remove undefined
  lastChannelId: string | undefined;
  channels: Channel[];
  currentUserInfo: CurrentUser | undefined;
  users: Users;
  existingVersion: string | undefined;
}

export interface IManager {
  token: string | undefined;
  store: IStore;
  messages: Messages;
  isAuthenticated: () => boolean;
  getSelectedProvider: () => string | undefined;
  getChannel: (channelId: string | undefined) => Channel | undefined;
  getIMChannel: (user: User) => Channel | undefined;
  getChannelLabels: () => any;
  getUnreadCount: (channel: Channel) => number;
  getCurrentWorkspaceName: () => string | undefined;
  updateMessages: (channelId: string, newMessages: ChannelMessages) => void;
  loadChannelHistory: (channelId: string) => Promise<void>;
  updateReadMarker: () => void;
  updateUserPresence: (userId: string, isOnline: boolean) => void;
  addReaction: (
    channelId: string,
    msgTimestamp: string,
    userId: string,
    reactionName: string
  ) => void;
  removeReaction: (
    channelId: string,
    msgTimestamp: string,
    userId: string,
    reactionName: string
  ) => void;
}

export interface ChatArgs {
  channel?: Channel;
  user?: User;
  source: EventSource;
}

export enum EventSource {
  status = "status_item",
  command = "command_palette",
  activity = "activity_bar",
  info = "info_message",
  slash = "slash_command"
}

export enum EventType {
  extensionInstalled = "extension_installed",
  viewOpened = "webview_opened",
  messageSent = "message_sent",
  vslsShared = "vsls_shared",
  tokenConfigured = "token_configured",
  channelChanged = "channel_changed",
  authStarted = "auth_started"
}

export interface EventProperties {
  source: EventSource | undefined;
  channel_type: ChannelType | undefined;
}

export interface TelemetryEvent {
  type: EventType;
  time: Date;
  properties: EventProperties;
}
