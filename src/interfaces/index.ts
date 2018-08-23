export interface SlackUser {
  id: string;
  name: string;
  fullName: string;
  imageUrl: string;
  smallImageUrl: string;
  isOnline: boolean;
  isBot?: boolean;
}

export interface SlackCurrentUser {
  id: string;
  name: string;
  token: string;
  teamId: string;
  teamName: string;
}

export interface SlackUsers {
  [id: string]: SlackUser;
}

interface SlackAttachment {
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
}

interface SlackMessage {
  timestamp: string;
  userId: string;
  text: string;
  textHTML?: string;
  isEdited?: Boolean;
  attachment?: SlackAttachment;
  content: MessageContent;
  reactions: MessageReaction[];
  replies: MessageReply[];
}

export interface SlackChannelMessages {
  [timestamp: string]: SlackMessage;
}

export interface SlackMessages {
  [channelId: string]: SlackChannelMessages;
}

export enum ChannelType {
  channel = "channel",
  group = "group",
  im = "im"
}

export interface SlackChannel {
  id: string;
  name: string;
  type: ChannelType;
  readTimestamp: string;
  unreadCount: number;
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
  messages: SlackChannelMessages;
  users: SlackUsers;
  channelName: string;
  currentUser: SlackCurrentUser;
  statusText: string;
}

export interface UIMessageDateGroup {
  groups: UIMessageGroup[];
  date: string;
}

export interface UIMessageGroup {
  messages: SlackMessage[];
  userId: string;
  user: SlackUser;
  minTimestamp: string;
  key: string;
}

export interface IStore {
  slackToken: string;
  lastChannelId: string;
  channels: SlackChannel[];
  currentUserInfo: SlackCurrentUser;
  users: SlackUsers;
  messages: SlackMessages;
  getChannel: (string) => SlackChannel | undefined;
  updateMessages: (
    channelId: string,
    newMessages: SlackChannelMessages
  ) => void;
  loadChannelHistory: (string) => Promise<void>;
  updateReadMarker: (string) => void;
  updateUserPresence: (string, Boolean) => void;
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

export interface IMessenger {
  start: () => Promise<SlackCurrentUser>;
  sendMessage: (text: string) => Promise<any>;
}

export interface ChatArgs {
  channel: SlackChannel;
  user: SlackUser;
}
