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
  private currentUserInfo: { [provider: string]: CurrentUser };
  private channels: { [provider: string]: Channel[] };
  private users: { [provider: string]: Users };
  private lastChannelId: { [provider: string]: string };

  constructor(private context: vscode.ExtensionContext) {
    const { globalState } = context;
    this.installationId = globalState.get(stateKeys.INSTALLATION_ID);
    this.existingVersion = globalState.get(stateKeys.EXTENSION_VERSION);
    this.channels = globalState.get(stateKeys.CHANNELS) || {};
    this.currentUserInfo = globalState.get(stateKeys.USER_INFO) || {};
    this.users = globalState.get(stateKeys.USERS) || {};
    this.lastChannelId = globalState.get(stateKeys.LAST_CHANNEL_ID) || {};
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
    return this.currentUserInfo[provider];
  };

  getCurrentUserForAll = (): CurrentUser[] => {
    const providers = Object.keys(this.currentUserInfo);
    return providers.map(provider => this.currentUserInfo[provider]);
  };

  getUsers = (provider: string): Users => {
    return this.users[provider] || {};
  };

  getChannels = (provider: string): Channel[] => {
    return this.channels[provider] || [];
  };

  getLastChannelId = (provider: string): string | undefined => {
    return this.lastChannelId[provider];
  };

  updateLastChannelId = (
    provider: string,
    channelId: string | undefined
  ): Thenable<void> => {
    const lastChannels = {
      ...this.lastChannelId,
      [provider]: channelId
    };
    this.lastChannelId = this.getObjectWithoutUndefined(lastChannels);
    return this.context.globalState.update(
      stateKeys.LAST_CHANNEL_ID,
      this.lastChannelId
    );
  };

  updateUsers = (provider: string, users: Users): Thenable<void> => {
    this.users = {
      ...this.users,
      [provider]: users
    };

    if (Object.keys(users).length <= VALUE_LENGTH_LIMIT) {
      return this.context.globalState.update(stateKeys.USERS, this.users);
    }

    return Promise.resolve();
  };

  updateUser = (provider: string, userId: string, user: User) => {
    // NOTE: This does not store to the local storage
    const providerUsers = this.users[provider] || {};
    this.users = {
      ...this.users,
      [provider]: {
        ...providerUsers,
        [userId]: { ...user }
      }
    };
  };

  getUser = (provider: string, userId: string): User | undefined => {
    const providerUsers = this.users[provider] || {};
    return providerUsers[userId];
  };

  updateChannels = (provider: string, channels: Channel[]): Thenable<void> => {
    this.channels = { ...this.channels, [provider]: channels };

    if (channels.length <= VALUE_LENGTH_LIMIT) {
      return this.context.globalState.update(stateKeys.CHANNELS, this.channels);
    }

    return Promise.resolve();
  };

  updateCurrentUser = (
    provider: string,
    userInfo: CurrentUser | undefined
  ): Thenable<void> => {
    const cachedCurrentUser = this.currentUserInfo[provider];
    let newCurrentUser: CurrentUser | undefined;
    // In the case of discord, we need to know the current team (guild)
    // If that is available in the store, we should use that
    if (!userInfo) {
      // Resetting userInfo
      newCurrentUser = userInfo;
    } else {
      let currentTeamId = !!cachedCurrentUser
        ? cachedCurrentUser.currentTeamId
        : undefined;

      if (!!userInfo.currentTeamId) {
        currentTeamId = userInfo.currentTeamId;
      }

      newCurrentUser = { ...userInfo, currentTeamId };
    }

    const updatedCurrentUserInfo = {
      ...this.currentUserInfo,
      [provider]: !!newCurrentUser ? { ...newCurrentUser } : undefined
    };
    this.currentUserInfo = this.getObjectWithoutUndefined(
      updatedCurrentUserInfo
    );
    return this.context.globalState.update(
      stateKeys.USER_INFO,
      this.currentUserInfo
    );
  };

  clearProviderState = async (provider: string): Promise<void> => {
    this.currentUserInfo = this.getObjectWithoutUndefined({
      ...this.currentUserInfo,
      [provider]: undefined
    });
    this.users = this.getObjectWithoutUndefined({
      ...this.users,
      [provider]: undefined
    });
    this.channels = this.getObjectWithoutUndefined({
      ...this.channels,
      [provider]: undefined
    });
    this.lastChannelId = this.getObjectWithoutUndefined({
      ...this.lastChannelId,
      [provider]: undefined
    });
    await this.context.globalState.update(
      stateKeys.USER_INFO,
      this.currentUserInfo
    );
    await this.context.globalState.update(stateKeys.USERS, this.users);
    await this.context.globalState.update(stateKeys.CHANNELS, this.channels);
    return this.context.globalState.update(
      stateKeys.LAST_CHANNEL_ID,
      this.lastChannelId
    );
  };

  private getObjectWithoutUndefined = (input: any) => {
    // Remove undefined values from the input object
    let withoutUndefined: any = {};
    Object.keys(input).forEach(key => {
      const value = input[key];
      if (!!value) {
        withoutUndefined[key] = value;
      }
    });
    return withoutUndefined;
  };
}
