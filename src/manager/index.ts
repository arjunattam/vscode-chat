import * as vscode from "vscode";
import * as semver from "semver";
import Logger from "../logger";
import { getExtensionVersion, hasVslsExtension } from "../utils";
import { DiscordChatProvider } from "../discord";
import { SlackChatProvider } from "../slack";
import { VslsChatProvider } from "../vslsChat";
import { Store } from "../store";
import { ViewsManager } from "./views";
import { ConfigHelper } from "../config";
import { VslsContactProvider } from "./vslsContactProvider";
import { ChatProviderManager } from "./chatManager";

export default class Manager implements IManager, vscode.Disposable {
  isTokenInitialized: boolean = false;
  viewsManager: ViewsManager | undefined;
  vslsContactProvider: VslsContactProvider | undefined;
  chatProviders = new Map<Providers, ChatProviderManager>();

  constructor(public store: Store) {
    const existingVersion = this.store.existingVersion;
    const currentVersion = getExtensionVersion();

    if (!!currentVersion && existingVersion !== currentVersion) {
      // There has been an upgrade. Apply data migrations if required.
      Logger.log(`Extension updated to ${currentVersion}`);

      if (!!existingVersion) {
        if (semver.lt(existingVersion, "0.6.0")) {
          Logger.log("Migration for 0.6.0: add slack as default provider");
          const { currentUserInfo } = this.store;

          if (!!currentUserInfo) {
            const userInfo = { ...currentUserInfo, provider: Providers.slack };
            this.store.updateCurrentUser(userInfo);
          }
        }
      }

      this.store.updateExtensionVersion(currentVersion);
    }
  }

  getEnabledProviders(): string[] {
    const { currentUserInfo } = this.store;
    let providers: string[] = [];

    if (!!currentUserInfo) {
      providers.push(currentUserInfo.provider);
    }

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
    const provider = this.getCurrentProvider();
    const hasNonVslsChatProvider = !!provider && provider !== "vsls";

    if (hasVslsExtension() && hasNonVslsChatProvider) {
      const isNotAlreadyInit =
        !this.vslsContactProvider || !this.vslsContactProvider.isInitialized;
      const { currentUserInfo, users } = this.store;

      if (isNotAlreadyInit && !!currentUserInfo) {
        this.vslsContactProvider = new VslsContactProvider(
          <string>provider,
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
    this.store.updateCurrentUser(undefined);
    this.clearOldWorkspace();
  }

  clearOldWorkspace() {
    // This clears workspace info, does not clear current user
    this.store.updateLastChannelId(undefined);
    this.store.updateChannels([]);
    this.store.updateUsers({});
    // this.messages = {};
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

  getUserForId(userId: string) {
    return this.store.users[userId];
  }

  getIMChannel(user: User): Channel | undefined {
    // DM channels look like `name`
    const { name } = user;
    const { channels } = this.store;
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
    // TODO: move inside chat manager?
    const { currentUserInfo } = this.store;

    if (!!currentUserInfo) {
      const { teams, currentTeamId } = currentUserInfo;

      if (!!currentTeamId) {
        const team = teams.find(team => team.id === currentTeamId);
        return !!team ? team.name : undefined;
      }
    }
  };

  getUserPresence(userId: string) {
    // TODO: move inside chat manager?
    const user = this.store.users[userId];
    return !!user ? user.presence : undefined;
  }

  getCurrentPresence = () => {
    // TODO: move inside chat manager?
    const { currentUserInfo, users } = this.store;

    if (!!currentUserInfo) {
      const currentUser = users[currentUserInfo.id];
      return currentUser.presence;
    }
  };

  updateCurrentWorkspace = (
    team: Team,
    existingUserInfo: CurrentUser
  ): Thenable<void> => {
    const newCurrentUser: CurrentUser = {
      ...existingUserInfo,
      currentTeamId: team.id
    };
    // TODO: move to chat manager?
    return this.store.updateCurrentUser(newCurrentUser);
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
