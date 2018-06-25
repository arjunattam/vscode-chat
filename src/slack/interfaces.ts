export interface SlackUser {
  id: string;
  name: string;
  imageUrl: string;
}

export interface SlackCurrentUser {
  id: string;
  token: string;
}

export interface SlackUsers {
  [id: string]: SlackUser;
}

export interface SlackMessage {
  timestamp: string;
  text: string;
  userId: string;
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
}

export interface ExtensionMessage {
  command: string;
  text: string;
}

export interface UiMessage {
  messages: SlackMessage[];
  users: SlackUsers;
  channel: SlackChannel;
}
