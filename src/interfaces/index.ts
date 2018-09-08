export interface IChatProvider {
  getToken: () => Promise<string>;
  fetchUsers: () => Promise<Users>;
  fetchChannels: (users: Users) => Promise<Channel[]>;
  fetchChannelInfo: (channel: Channel) => Promise<Channel>;
  getBotInfo: (botId: string) => Promise<Users>;
  loadChannelHistory: (channelId: string) => Promise<ChannelMessages>;
  getUserPrefs: () => Promise<UserPreferences>;
  markChannel: (channel: Channel, ts: string) => Promise<Channel>;
  fetchThreadReplies: (channelId: string, ts: string) => Promise<Message>;
  sendMessage: (
    text: string,
    currentUserId: string,
    channelId: string
  ) => Promise<void>;
  connect: () => Promise<CurrentUser>;
  isConnected: () => boolean;
  subscribePresence: (users: Users) => void;

  /**
   * createIMChannel is used when we want to invite an online
   * user to VSLS, but we don't have an IM channel for that user
   */
  createIMChannel: (user: User) => Promise<Channel>;
}

export interface User {
  id: string;
  name: string;
  fullName: string;
  imageUrl: string;
  smallImageUrl: string;
  isOnline: boolean;
  isBot?: boolean;
}

export interface UserPreferences {
  mutedChannels?: string[];
}

export interface CurrentUser {
  id: string;
  name: string;
  token: string;
  // TODO: migrate existing data
  // teamId: string;
  // teamName: string;
  teams: Team[];
  currentTeamId: string;
}

export interface Team {
  // represents workspace for Slack, guild for Discord
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

export interface MessageReply {
  userId: string;
  timestamp: string;
  text?: string;
  attachment?: MessageAttachment;
  textHTML?: string;
}

export interface Message {
  timestamp: string;
  userId: string;
  text: string;
  textHTML?: string;
  isEdited?: Boolean;
  attachment?: MessageAttachment;
  content: MessageContent;
  reactions: MessageReaction[];
  replies: MessageReply[];
  // TODO - add
  // subscribed (for threads)
}

export interface ChannelMessages {
  [timestamp: string]: Message;
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
  readTimestamp: string;
  unreadCount: number;
  categoryName?: string; // for Discord
}

export interface ChannelLabel {
  channel: Channel;
  unread: number;
  icon: string;
  label: string;
  isOnline: boolean;
}

enum MessageType {
  text = "text",
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
  token: string;
  installationId: string;
  lastChannelId: string;
  channels: Channel[];
  currentUserInfo: CurrentUser;
  users: Users;
  messages: Messages;
  isAuthenticated: () => boolean;
  getChannel: (channelId: string) => Channel | undefined;
  getIMChannel: (user: User) => Channel | undefined;
  getChannelLabels: () => any;
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
  channel: Channel;
  user: User;
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
