import * as vscode from "vscode";
import { SelfCommands } from "../constants";
import SlackAPIClient from "./client";
import SlackMessenger from "./messenger";
import { IDNDStatusForUser, IDNDStatus } from "./common";

const stripLinkSymbols = (text: string): string => {
  // To send out live share links and render them correctly,
  // we append </> to the link text. However, this is not
  // handled by normal Slack clients, and should be removed before
  // we actually send the message via the RTM API

  // This is hacky, and we will need a better solution - perhaps
  // we could make all rendering manipulations on the extension side
  // before sending the message to Vuejs for rendering
  if (text.startsWith("<") && text.endsWith(">")) {
    return text.substr(1, text.length - 2);
  } else {
    return text;
  }
};

export class SlackChatProvider implements IChatProvider {
  private client: SlackAPIClient;
  private messenger: SlackMessenger;
  private teamDndState: IDNDStatusForUser = {};
  private dndTimers: NodeJS.Timer[] = [];

  constructor(private token: string, private manager: IManager) {
    this.client = new SlackAPIClient(this.token);
    this.messenger = new SlackMessenger(
      this.token,
      (userId: string, presence: "active" | "away") =>
        this.onPresenceChanged(userId, presence),
      (userId: string, dndState: IDNDStatus) =>
        this.onDndStateChanged(userId, dndState)
    );
  }

  public validateToken(): Promise<CurrentUser | undefined> {
    // This is creating a new client, since getToken from keychain
    // is not called before validation
    return this.client.authTest();
  }

  public connect(): Promise<CurrentUser> {
    return this.messenger.start();
  }

  public isConnected(): boolean {
    return !!this.messenger && this.messenger.isConnected();
  }

  public subscribePresence(users: Users) {
    return this.messenger.subscribePresence(users);
  }

  public createIMChannel(user: User): Promise<Channel | undefined> {
    return this.client.openIMChannel(user);
  }

  public fetchUsers(): Promise<Users> {
    // async update for dnd statuses
    this.client.getDndTeamInfo().then(response => {
      this.teamDndState = response;
      this.updateDndTimers();
    });

    return this.client.getUsers();
  }

  public fetchChannels(users: Users): Promise<Channel[]> {
    // users argument is required to associate IM channels
    // with users
    return this.client.getChannels(users);
  }

  private onPresenceChanged(userId: string, rawPresence: "active" | "away") {
    // This method is called from the websocket client
    // Here, we parse the incoming raw presence (active / away), and use our
    // known dnd related information, to find the final answer for this user
    let presence: UserPresence = UserPresence.unknown;

    switch (rawPresence) {
      case "active":
        presence = UserPresence.available;
        break;
      case "away":
        presence = UserPresence.offline;
        break;
    }

    if (presence === UserPresence.available) {
      // Check user has dnd active right now
      const userDnd = this.teamDndState[userId];

      if (!!userDnd) {
        const current = +new Date() / 1000.0;

        if (
          current > userDnd.next_dnd_start_ts &&
          current < userDnd.next_dnd_end_ts
        ) {
          presence = UserPresence.doNotDisturb;
        }
      }
    }

    this.updateUserPresence(userId, presence);
  }

  private updateUserPresence(userId: string, presence: UserPresence) {
    vscode.commands.executeCommand(SelfCommands.UPDATE_PRESENCE_STATUSES, {
      userId,
      presence,
      provider: "slack"
    });
  }

  private onDndStateChanged(userId: string, dndState: IDNDStatus) {
    this.teamDndState[userId] = dndState;
    this.updateDndTimerForUser(userId);
  }

  private updateDndTimers() {
    const userIds = Object.keys(this.teamDndState);
    userIds.forEach(userId => {
      this.updateDndTimerForUser(userId);
    });
  }

  private updateDndTimerForUser(userId: string) {
    const dndState = this.teamDndState[userId];
    const currentTime = +new Date() / 1000.0;
    const { next_dnd_end_ts: dndEnd, next_dnd_start_ts: dndStart } = dndState;

    if (currentTime < dndStart) {
      // Impending start event, so we will define a start timer
      const delay = (dndStart - currentTime) * 1000;
      const timer = setTimeout(() => {
        // If user is available, change to dnd
        const presence = this.manager.getUserPresence("slack", userId);

        if (presence === UserPresence.available) {
          this.updateUserPresence(userId, UserPresence.doNotDisturb);
        }
      }, delay);

      this.dndTimers.push(timer);
    }

    if (currentTime < dndEnd) {
      // Impending end event, so define a start timer
      const delay = (dndEnd - currentTime) * 1000;
      const timer = setTimeout(() => {
        // If user is dnd, change to available
        const presence = this.manager.getUserPresence("slack", userId);

        if (presence === UserPresence.doNotDisturb) {
          this.updateUserPresence(userId, UserPresence.available);
        }
      }, delay);

      this.dndTimers.push(timer);
    }
  }

  public fetchUserInfo(userId: string): Promise<User | undefined> {
    if (userId.startsWith("B")) {
      return this.client.getBotInfo(userId);
    } else {
      return this.client.getUserInfo(userId);
    }
  }

  public loadChannelHistory(channelId: string): Promise<ChannelMessages> {
    return this.client.getConversationHistory(channelId);
  }

  public getUserPreferences(): Promise<UserPreferences | undefined> {
    return this.client.getUserPrefs();
  }

  public markChannel(
    channel: Channel,
    timestamp: string
  ): Promise<Channel | undefined> {
    return this.client.markChannel(channel, timestamp);
  }

  public fetchThreadReplies(
    channelId: string,
    timestamp: string
  ): Promise<Message | undefined> {
    return this.client.getReplies(channelId, timestamp);
  }

  public fetchChannelInfo(channel: Channel): Promise<Channel | undefined> {
    return this.client.getChannelInfo(channel);
  }

  public sendThreadReply(
    text: string,
    currentUserId: string,
    channelId: string,
    parentTimestamp: string
  ) {
    const cleanText = stripLinkSymbols(text);
    return this.client.sendMessage(channelId, cleanText, parentTimestamp);
  }

  public async sendMessage(
    text: string,
    currentUserId: string,
    channelId: string
  ) {
    const cleanText = stripLinkSymbols(text);

    try {
      const result = await this.messenger.sendMessage(channelId, cleanText);

      // TODO: this is not the correct timestamp to attach, since the
      // API might get delayed, because of network issues
      let newMessages: ChannelMessages = {};
      newMessages[result.ts] = {
        userId: currentUserId,
        timestamp: result.ts,
        text,
        content: undefined,
        reactions: [],
        replies: {}
      };

      vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
        channelId,
        messages: newMessages,
        provider: "slack"
      });
    } catch (error) {
      return console.error(error);
    }
  }

  public async updateSelfPresence(
    presence: UserPresence,
    durationInMinutes: number
  ): Promise<UserPresence | undefined> {
    let response;
    const currentPresence = this.manager.getCurrentUserPresence("slack");

    switch (presence) {
      case UserPresence.doNotDisturb:
        response = await this.client.setUserSnooze(durationInMinutes);
        break;
      case UserPresence.available:
        if (currentPresence === UserPresence.doNotDisturb) {
          // client.endUserDnd() can handle both situations -- when user is on
          // snooze, and when user is on a scheduled dnd
          response = await this.client.endUserDnd();
        } else {
          response = await this.client.setUserPresence("auto");
        }

        break;
      case UserPresence.invisible:
        response = await this.client.setUserPresence("away");
        break;
      default:
        throw new Error(`unsupported presence type`);
    }

    return !!response ? presence : undefined;
  }

  public destroy(): Promise<void> {
    if (!!this.messenger) {
      this.messenger.disconnect();
    }

    this.dndTimers.forEach(timer => {
      clearTimeout(timer);
    });

    return Promise.resolve();
  }
}
