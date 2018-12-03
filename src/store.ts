import * as vscode from "vscode";
import { uuidv4 } from "./utils";

// Large discord communities can have lots of users/channels
// More than the quota of context.globalState
const VALUE_LENGTH_LIMIT = 100;

const stateKeys = {
  EXTENSION_VERSION: "extensionVersion",
  INSTALLATION_ID: "installationId",
  LAST_CHANNEL_ID: "lastChannelId",
  CHANNELS: "channels",
  USER_INFO: "userInfo",
  USERS: "users"
};

export class Store implements IStore {
  public installationId: string | undefined;
  public existingVersion: string | undefined;
  private currentUserInfo: CurrentUser | undefined;
  private channels: Channel[] = [];
  private users: Users = {};
  private lastChannelId: string | undefined;

  constructor(private context: vscode.ExtensionContext) {
    const { globalState } = context;
    this.installationId = globalState.get(stateKeys.INSTALLATION_ID);
    this.channels = globalState.get(stateKeys.CHANNELS) || [];
    this.currentUserInfo = globalState.get(stateKeys.USER_INFO);
    this.users = globalState.get(stateKeys.USERS) || {};
    this.lastChannelId = globalState.get(stateKeys.LAST_CHANNEL_ID);
    this.existingVersion = globalState.get(stateKeys.EXTENSION_VERSION);
  }

  generateInstallationId(): string {
    const uuidStr = uuidv4();
    const { globalState } = this.context;
    globalState.update(stateKeys.INSTALLATION_ID, uuidStr);
    this.installationId = uuidStr;
    return uuidStr;
  }

  updateExtensionVersion(version: string) {
    const { globalState } = this.context;
    return globalState.update(stateKeys.EXTENSION_VERSION, version);
  }

  getCurrentUser = (provider: string): CurrentUser | undefined => {
    return this.currentUserInfo;
  };

  getCurrentUserForAll = (): CurrentUser[] => {
    return !!this.currentUserInfo ? [this.currentUserInfo] : [];
  };

  getUsers = (provider: string): Users => {
    return this.users;
  };

  getChannels = (provider: string): Channel[] => {
    return this.channels;
  };

  getLastChannelId = (provider: string): string | undefined => {
    return this.lastChannelId;
  };

  updateLastChannelId = (
    provider: string,
    channelId: string | undefined
  ): Thenable<void> => {
    this.lastChannelId = channelId;
    return this.context.globalState.update(
      stateKeys.LAST_CHANNEL_ID,
      this.lastChannelId
    );
  };

  updateUsers = (provider: string, users: Users): Thenable<void> => {
    this.users = users;

    if (Object.keys(this.users).length <= VALUE_LENGTH_LIMIT) {
      return this.context.globalState.update(stateKeys.USERS, this.users);
    }

    return Promise.resolve();
  };

  updateUser = (provider: string, userId: string, user: User) => {
    // This does not store to the local storage
    // TODO: support provider stuff
    this.users[userId] = {
      ...user
    };
  };

  getUser = (provider: string, userId: string) => {
    // TODO: support provider stuff
    return this.users[userId];
  };

  updateChannels = (provider: string, channels: Channel[]): Thenable<void> => {
    this.channels = channels;

    if (this.channels.length <= VALUE_LENGTH_LIMIT) {
      return this.context.globalState.update(stateKeys.CHANNELS, this.channels);
    }

    return Promise.resolve();
  };

  updateCurrentUser = (
    provider: string,
    userInfo: CurrentUser | undefined
  ): Thenable<void> => {
    // In the case of discord, we need to know the current team (guild)
    // If that is available in the store, we should use that
    if (!userInfo) {
      // Resetting userInfo
      this.currentUserInfo = userInfo;
    } else {
      let currentTeamId = !!this.currentUserInfo
        ? this.currentUserInfo.currentTeamId
        : undefined;

      if (!!userInfo.currentTeamId) {
        currentTeamId = userInfo.currentTeamId;
      }

      this.currentUserInfo = { ...userInfo, currentTeamId };
    }

    return this.context.globalState.update(
      stateKeys.USER_INFO,
      this.currentUserInfo
    );
  };
}
