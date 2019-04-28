import * as vscode from "vscode";
import * as semver from "semver";
import { uuidv4, getExtensionVersion } from "./utils";

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
    this.loadInitialState();
  }

  loadInitialState() {
    const { globalState } = this.context;
    this.installationId = globalState.get(stateKeys.INSTALLATION_ID);
    this.existingVersion = globalState.get(stateKeys.EXTENSION_VERSION);
    this.channels = globalState.get(stateKeys.CHANNELS) || {};
    this.currentUserInfo = globalState.get(stateKeys.USER_INFO) || {};
    this.users = globalState.get(stateKeys.USERS) || {};
    this.lastChannelId = globalState.get(stateKeys.LAST_CHANNEL_ID) || {};
  }

  async runStateMigrations() {
    const currentVersion = getExtensionVersion();

    if (!!currentVersion && this.existingVersion !== currentVersion) {
      if (!!this.existingVersion) {
        if (semver.lt(this.existingVersion, "0.9.0")) {
          await this.migrateFor09x();
        }
      }

      this.updateExtensionVersion(currentVersion);
      this.loadInitialState();
    }
  }

  async migrateFor09x() {
    // Run migrations for 0.9.x
    const { globalState } = this.context;
    const currentUser: any = globalState.get(stateKeys.USER_INFO);

    if (!!currentUser) {
      const { provider } = currentUser;

      if (!!provider) {
        const channels = globalState.get(stateKeys.CHANNELS);
        const users = globalState.get(stateKeys.USERS);
        const lastChannelId = globalState.get(stateKeys.LAST_CHANNEL_ID);
        await globalState.update(stateKeys.USER_INFO, {
          [provider]: currentUser
        });
        await globalState.update(stateKeys.CHANNELS, {
          [provider]: channels
        });
        await globalState.update(stateKeys.USERS, { [provider]: users });
        await globalState.update(stateKeys.LAST_CHANNEL_ID, {
          [provider]: lastChannelId
        });
      }
    }
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
    const totalUserCount = Object.values(this.users)
      .map(usersObject => Object.keys(usersObject).length)
      .reduce((acc, curr) => acc + curr);

    if (totalUserCount <= VALUE_LENGTH_LIMIT) {
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
    const totalChannelCount = Object.values(this.channels)
      .map(channels => channels.length)
      .reduce((acc, curr) => acc + curr);

    if (totalChannelCount <= VALUE_LENGTH_LIMIT) {
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

    if (!userInfo) {
      newCurrentUser = userInfo; // Resetting userInfo
    } else {
      // Copy cover the currentTeamId from existing state, if available
      let currentTeamId = !!cachedCurrentUser
        ? cachedCurrentUser.currentTeamId
        : undefined;

      if (!!userInfo.currentTeamId) {
        currentTeamId = userInfo.currentTeamId;
      }

      newCurrentUser = { ...userInfo, currentTeamId };

      // If this is Slack, our local state might know of more workspaces
      if (provider === "slack" && !!cachedCurrentUser) {
        let mergedTeams: any = {};
        const { teams: newTeams } = userInfo;
        const { teams: existingTeams } = cachedCurrentUser;
        existingTeams.forEach(team => (mergedTeams[team.id] = team));
        newTeams.forEach(team => (mergedTeams[team.id] = team));
        const teams = Object.keys(mergedTeams).map(key => mergedTeams[key]);
        newCurrentUser = {
          ...newCurrentUser,
          teams
        };
      }
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

  async clearProviderState(provider: string): Promise<void> {
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
