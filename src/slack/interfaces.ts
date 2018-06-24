export interface SlackUser {
  id: string;
  displayName: string;
  imageUrl: string;
}

export interface SlackUsers {
  [id: string]: SlackUser;
}

export interface SlackMessage {
  timestamp: string;
  text: string;
  userId: string;
}

export interface ExtensionMessage {
  command: string;
  text: string;
}

export interface UiMessage {
  messages: SlackMessage[];
  users: SlackUsers;
}
