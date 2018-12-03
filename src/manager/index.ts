import * as vscode from "vscode";
import * as semver from "semver";
import Logger from "../logger";
import { getExtensionVersion, hasVslsExtension } from "../utils";
import { DiscordChatProvider } from "../discord";
import { SlackChatProvider } from "../slack";
import { VslsChatProvider } from "../vslsChat";
import { ViewsManager } from "./views";
import { ConfigHelper } from "../config";
import { VslsContactProvider } from "./vslsContactProvider";
import { ChatProviderManager } from "./chatManager";

export default class Manager implements IManager, vscode.Disposable {
  isTokenInitialized: boolean = false;
  viewsManager: ViewsManager | undefined;
  vslsContactProvider: VslsContactProvider | undefined;
  chatProviders = new Map<Providers, ChatProviderManager>();

  constructor(public store: IStore) {
    const existingVersion = this.store.existingVersion;
    const currentVersion = getExtensionVersion();

    if (!!currentVersion && existingVersion !== currentVersion) {
      Logger.log(`Extension updated to ${currentVersion}`);

      if (!!existingVersion) {
        if (semver.lt(existingVersion, "0.9.0")) {
          Logger.log("Migration for 0.9.0");
          // TODO:
        }
      }

      this.store.updateExtensionVersion(currentVersion);
    }
  }

  getEnabledProviders(): string[] {
    let currentUserInfos = this.store.getCurrentUserForAll();
    let providers: string[] = currentUserInfos.map(
      currentUser => currentUser.provider
    );
    const hasVsls = hasVslsExtension();

    if (hasVsls) {
      providers.push(Providers.vsls);
    }

    // vsls can be added twice: once via currentUserInfo, and
    // then via the VSLS extension availability check
    const uniqueProviders = providers.filter(function(item, pos) {
      return providers.indexOf(item) === pos;
    });
    return uniqueProviders;
  }

  getCurrentProvider(): string {
    // TODO: this is incorrect --> where is this used? how should this work?
    return `vsls`;
  }

  getChatProvider(providerName: Providers) {
    return this.chatProviders.get(providerName);
  }

  async signout() {
    // TODO:
    // const provider = manager.getCurrentProvider();
    // if (!!provider) {
    //   await ConfigHelper.clearToken(provider);
    // }
  }

  instantiateChatProvider(token: string, provider: string): IChatProvider {
    switch (provider) {
      case "discord":
        return new DiscordChatProvider(token, this);
      case "slack":
        return new SlackChatProvider(token, this);
      case "vsls":
        return new VslsChatProvider();
      default:
        throw new Error(`unsupport chat provider: ${provider}`);
    }
  }

  async validateToken(provider: string, token: string) {
    const chatProvider = this.instantiateChatProvider(token, provider);
    const currentUser = await chatProvider.validateToken();
    return currentUser;
  }

  isAuthenticated(providerName: string | undefined): boolean {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.isAuthenticated() : false;
  }

  initializeToken = async (newProvider?: string) => {
    let enabledProviders = this.getEnabledProviders();

    if (!!newProvider) {
      // In addition to the enabled providers, we will
      // add support for this newProvider
      enabledProviders.push(newProvider);
    }

    if (!!this.viewsManager) {
      this.viewsManager.dispose();
    }

    this.viewsManager = new ViewsManager(enabledProviders, this);

    for (const provider of enabledProviders) {
      const token = await ConfigHelper.getToken(provider);

      if (!!token) {
        const chatProvider = this.instantiateChatProvider(token, provider);
        this.chatProviders.set(
          provider as Providers,
          new ChatProviderManager(this.store, provider, chatProvider, this)
        );
        this.isTokenInitialized = true;
      }
    }
  };

  initializeProviders = async (): Promise<any> => {
    for (let entry of Array.from(this.chatProviders.entries())) {
      let chatProvider = entry[1];
      await chatProvider.initializeProvider();
    }
  };

  async initializeUsersStateForAll() {
    for (let entry of Array.from(this.chatProviders.entries())) {
      let chatProvider = entry[1];
      await chatProvider.initializeUsersState();
    }
  }

  async initializeChannelsStateForAll() {
    for (let entry of Array.from(this.chatProviders.entries())) {
      let chatProvider = entry[1];
      await chatProvider.initializeChannelsState();
    }
  }

  subscribePresenceForAll() {
    for (let entry of Array.from(this.chatProviders.entries())) {
      let chatProvider = entry[1];
      chatProvider.subscribeForPresence();
    }
  }

  async updateUserPrefsForAll() {
    for (let entry of Array.from(this.chatProviders.entries())) {
      let chatProvider = entry[1];
      await chatProvider.updateUserPrefs();
    }
  }

  initializeVslsContactProvider = async (): Promise<any> => {
    // This method is called after the users state has been initialized, since
    // the vsls contact provider uses list of users to match with vsls contacts.
    const enabledProviders = this.getEnabledProviders();
    const nonVslsProviders = enabledProviders.filter(
      provider => provider !== "vsls"
    );

    if (hasVslsExtension() && nonVslsProviders.length > 0) {
      const presenceProvider = nonVslsProviders[0]; // we are restricting this to only one
      const isNotAlreadyInit =
        !this.vslsContactProvider || !this.vslsContactProvider.isInitialized;

      const currentUserInfo = this.store.getCurrentUser(presenceProvider);
      const users = this.store.getUsers(presenceProvider);

      if (isNotAlreadyInit && !!currentUserInfo) {
        this.vslsContactProvider = new VslsContactProvider(
          presenceProvider,
          this
        );
        await this.vslsContactProvider.register();

        const userId = currentUserInfo.id;
        const currentUser = users[userId];
        this.vslsContactProvider.notifySelfContact(currentUser);
        this.vslsContactProvider.notifyAvailableUsers(userId, users);
      }
    }
  };

  clearAll() {
    // TODO: fix logging out/reset
    // this.store.updateCurrentUser(undefined);
    this.clearOldWorkspace();
  }

  clearOldWorkspace() {
    // This clears workspace info, does not clear current user
    // TODO: fix logging out/reset
    // this.store.updateLastChannelId(undefined);
    // this.store.updateChannels([]);
    // this.store.updateUsers({});
    this.isTokenInitialized = false;

    for (let key of Array.from(this.chatProviders.keys())) {
      const chatProvider = this.chatProviders.get(key);

      if (!!chatProvider) {
        chatProvider.destroy();
        this.chatProviders.delete(key);
      }
    }
  }

  updateAllUI() {
    if (!!this.viewsManager) {
      this.viewsManager.updateStatusItem();
      this.viewsManager.updateTreeViews(this.getCurrentProvider());
      this.viewsManager.updateWebview(this.getCurrentProvider());
    }
  }

  dispose() {
    if (!!this.viewsManager) {
      this.viewsManager.dispose();
    }
  }

  getChannelLabels(provider: string): ChannelLabel[] {
    const cp = this.chatProviders.get(provider as Providers);
    return !!cp ? cp.getChannelLabels() : [];
  }

  getUserForId(provider: string, userId: string) {
    return this.store.getUser(provider, userId);
  }

  getIMChannel(provider: string, user: User): Channel | undefined {
    // DM channels look like `name`
    const channels = this.store.getChannels(provider);
    const { name } = user;
    return channels.find(channel => channel.name === name);
  }

  async createIMChannel(
    providerName: string,
    user: User
  ): Promise<Channel | undefined> {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.createIMChannel(user) : undefined;
  }

  getCurrentWorkspaceName = () => {
    // TODO: fix this implementation after new status bar item
    //
    //
    // const { currentUserInfo } = this.store;

    // if (!!currentUserInfo) {
    //   const { teams, currentTeamId } = currentUserInfo;

    //   if (!!currentTeamId) {
    //     const team = teams.find(team => team.id === currentTeamId);
    //     return !!team ? team.name : undefined;
    //   }
    // }
    return `workspace`;
  };

  getUserPresence(provider: string, userId: string) {
    const cp = this.chatProviders.get(provider as Providers);
    return !!cp ? cp.getUserPresence(userId) : undefined;
  }

  getCurrentUserPresence = (provider: string) => {
    const cp = this.chatProviders.get(provider as Providers);
    return !!cp ? cp.getCurrentUserPresence() : undefined;
  };

  updateCurrentWorkspace = async (
    team: Team,
    existingUserInfo: CurrentUser
  ): Promise<void> => {
    const newCurrentUser: CurrentUser = {
      ...existingUserInfo,
      currentTeamId: team.id
    };
    // TODO: fix this after the workspace stuff is working
    //
    //
    // return this.store.updateCurrentUser(newCurrentUser);
    return;
  };

  async loadChannelHistory(
    providerName: string,
    channelId: string
  ): Promise<void> {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.loadChannelHistory(channelId) : undefined;
  }

  async updateReadMarker(providerName: string): Promise<void> {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.updateReadMarker() : undefined;
  }

  sendMessage = async (
    providerName: string,
    text: string,
    channelId: string,
    parentTimestamp: string | undefined
  ): Promise<void> => {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.sendMessage(text, channelId, parentTimestamp) : undefined;
  };

  updateSelfPresence = async (
    providerName: string,
    presence: UserPresence,
    durationInMinutes: number
  ) => {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp
      ? cp.updateSelfPresence(presence, durationInMinutes)
      : undefined;
  };

  addReaction(
    providerName: string,
    channelId: string,
    msgTimestamp: string,
    userId: string,
    reactionName: string
  ) {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp
      ? cp.addReaction(channelId, msgTimestamp, userId, reactionName)
      : undefined;
  }

  removeReaction(
    providerName: string,
    channelId: string,
    msgTimestamp: string,
    userId: string,
    reactionName: string
  ) {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp
      ? cp.removeReaction(channelId, msgTimestamp, userId, reactionName)
      : undefined;
  }

  async fetchThreadReplies(providerName: string, parentTimestamp: string) {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.fetchThreadReplies(parentTimestamp) : undefined;
  }

  updateMessageReply(
    providerName: string,
    parentTimestamp: string,
    channelId: string,
    reply: MessageReply
  ) {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp
      ? cp.updateMessageReply(parentTimestamp, channelId, reply)
      : undefined;
  }

  updateMessages(
    providerName: string,
    channelId: string,
    messages: ChannelMessagesWithUndefined
  ) {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.updateMessages(channelId, messages) : undefined;
  }

  updateChannelMarked(
    provider: string,
    channelId: string,
    readTimestamp: string,
    unreadCount: number
  ) {
    const cp = this.chatProviders.get(provider as Providers);
    return !!cp
      ? cp.updateChannelMarked(channelId, readTimestamp, unreadCount)
      : undefined;
  }

  updatePresenceForUser = (
    providerName: string,
    userId: string,
    presence: UserPresence
  ) => {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.updatePresenceForUser(userId, presence) : undefined;
  };

  getChannel = (
    provider: string,
    channelId: string | undefined
  ): Channel | undefined => {
    const cp = this.chatProviders.get(provider as Providers);
    return !!cp ? cp.getChannel(channelId) : undefined;
  };

  fetchUsers = (providerName: string) => {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.fetchUsers() : undefined;
  };

  fetchChannels = (providerName: string) => {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.fetchChannels() : undefined;
  };

  getMessages = (providerName: string): Messages => {
    const cp = this.chatProviders.get(providerName as Providers);
    return !!cp ? cp.messages : {};
  };

  getUnreadCount = (provider: string, channel: Channel) => {
    const cp = this.chatProviders.get(provider as Providers);
    return !!cp ? cp.getUnreadCount(channel) : 0;
  };
}
