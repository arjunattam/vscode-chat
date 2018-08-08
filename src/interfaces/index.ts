interface SlackUser {
  id: string;
  name: string;
  imageUrl: string;
  isBot?: Boolean;
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

interface SlackMessage {
  timestamp: string;
  userId: string;
  text: string;
  textHTML?: string;
  isEdited?: Boolean;
  attachment?: SlackAttachment;
  content: MessageContent;
}

export interface SlackChannelMessages {
  [timestamp: string]: SlackMessage;
}

export interface SlackMessages {
  [channelId: string]: SlackChannelMessages;
}

enum ChannelType {
  channel = "channel",
  group = "group",
  im = "im"
}

export interface SlackChannel {
  id: string;
  name: string;
  type: ChannelType;
  readTimestamp: string;
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

export interface UiMessage {
  messages: SlackChannelMessages;
  users: SlackUsers;
  channelName: string;
  currentUser: SlackCurrentUser;
  statusText: string;
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
  loadChannelHistory: () => Promise<void>;
  getLastTimestamp: () => string;
  hasOldReadMarker: () => Boolean;
  updateReadMarker: (string) => void;
}

export interface IMessenger {
  start: () => Promise<SlackCurrentUser>;
  updateCurrentChannel: () => void;
  sendMessage: (text: string) => Promise<any>;
}
