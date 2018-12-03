import * as vscode from "vscode";
import { TreeViewManager } from "./treeView";
import { BaseStatusItem, UnreadsStatusItem } from "../status";
import { OnboardingTreeProvider } from "../onboarding";
import { SelfCommands } from "../constants";
import { VslsSessionTreeProvider } from "../tree/vsls";
import { VSLS_CHAT_CHANNEL } from "../vslsChat/utils";
import { setVsContext } from "../utils";

const PROVIDERS_WITH_TREE = ["slack", "discord"];

const getStatusItemKey = (provider: string, team: Team) => {
  return `${provider}:${team.id}`;
};

export class ViewsManager implements vscode.Disposable {
  statusItems: Map<string, BaseStatusItem>;
  treeViews: TreeViewManager | undefined;
  onboardingTree: OnboardingTreeProvider | undefined;
  vslsSessionTreeProvider: VslsSessionTreeProvider | undefined; // for vsls chat tree item

  constructor(
    enabledProviders: string[],
    private providerTeams: { [providerName: string]: Team[] },
    private parentManager: IManager
  ) {
    const hasVslsEnabled = enabledProviders.indexOf("vsls") >= 0;

    if (hasVslsEnabled) {
      this.vslsSessionTreeProvider = new VslsSessionTreeProvider();
      this.vslsSessionTreeProvider.register();
    }

    this.statusItems = new Map();
    enabledProviders.forEach(provider => {
      const teams = providerTeams[provider];
      teams.forEach(team => {
        const isVslsChat = provider !== "vsls";
        const statusItem = new UnreadsStatusItem(
          provider,
          team.name,
          isVslsChat
        );
        this.statusItems.set(getStatusItemKey(provider, team), statusItem);
      });
    });

    enabledProviders.forEach(provider => {
      if (PROVIDERS_WITH_TREE.indexOf(provider) >= 0) {
        // TODO: is this safe? is it possible that providerTeams is empty?
        const team = providerTeams[provider][0];
        this.treeViews = new TreeViewManager(provider as string, team);
      }
    });

    PROVIDERS_WITH_TREE.forEach(treeProvider => {
      const hasProviderEnabled = enabledProviders.indexOf(treeProvider) >= 0;
      setVsContext(`chat:${treeProvider}`, hasProviderEnabled);
    });

    const nonVslsProviders = enabledProviders.filter(
      provider => provider !== "vsls"
    );
    const showOnboarding = nonVslsProviders.length === 0;

    if (showOnboarding) {
      this.onboardingTree = new OnboardingTreeProvider();
    }
  }

  updateStatusItem(provider: string, team: Team) {
    const statusItem = this.statusItems.get(getStatusItemKey(provider, team));

    if (statusItem) {
      const channels = this.parentManager.store.getChannels(provider);
      const unreads = channels.map(channel => {
        return this.parentManager.getUnreadCount(provider, channel);
      });
      const totalUnreads = unreads.reduce((a, b) => a + b, 0);
      statusItem.updateCount(totalUnreads);
    }
  }

  updateTreeViews(provider: string) {
    if (!!this.treeViews && this.parentManager.isAuthenticated(provider)) {
      const channelLabels = this.parentManager.getChannelLabels(provider);
      this.treeViews.updateData(channelLabels);
    }

    if (!!this.vslsSessionTreeProvider) {
      const vslsChatChannel = this.parentManager.getChannel(
        "vsls",
        VSLS_CHAT_CHANNEL.id
      );

      if (!!vslsChatChannel) {
        const unreads = this.parentManager.getUnreadCount(
          provider,
          vslsChatChannel
        );
        this.vslsSessionTreeProvider.updateUnreadCount(unreads);
      }
    }
  }

  updateWebview(
    currentUser: CurrentUser,
    provider: string,
    users: Users,
    channel: Channel,
    messages: ChannelMessages
  ) {
    let uiMessage: UIMessage = {
      currentProvider: provider,
      messages,
      users,
      currentUser,
      channel,
      statusText: ""
    };

    vscode.commands.executeCommand(SelfCommands.SEND_TO_WEBVIEW, {
      uiMessage
    });
  }

  dispose() {
    for (let entry of Array.from(this.statusItems.entries())) {
      let statusItem = entry[1];
      statusItem.dispose();
    }

    if (!!this.treeViews) {
      this.treeViews.dispose();
    }

    if (!!this.onboardingTree) {
      this.onboardingTree.dispose();
    }

    if (!!this.vslsSessionTreeProvider) {
      this.vslsSessionTreeProvider.dispose();
    }
  }
}
