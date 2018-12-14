import * as vscode from "vscode";
import { TreeViewManager } from "./treeView";
import { BaseStatusItem, UnreadsStatusItem } from "../status";
import { OnboardingTreeProvider } from "../onboarding";
import { SelfCommands } from "../constants";
import { VslsSessionTreeProvider } from "../tree/vsls";
import { VSLS_CHAT_CHANNEL } from "../vslsChat/utils";
import { setVsContext, difference } from "../utils";

const PROVIDERS_WITH_TREE = ["slack", "discord"];

const getStatusItemKey = (provider: string, team: Team) => {
  return `${provider}:${team.id}`;
};

export class ViewsManager implements vscode.Disposable {
  statusItems: Map<string, BaseStatusItem> = new Map();
  treeViews: Map<string, TreeViewManager> = new Map();
  onboardingTree: OnboardingTreeProvider | undefined;
  vslsSessionTreeProvider: VslsSessionTreeProvider | undefined; // for vsls chat tree item

  constructor(private parentManager: IManager) {}

  initialize(
    enabledProviders: string[],
    providerTeams: { [providerName: string]: Team[] }
  ) {
    const hasVslsEnabled = enabledProviders.indexOf("vsls") >= 0;

    if (hasVslsEnabled && !this.vslsSessionTreeProvider) {
      this.vslsSessionTreeProvider = new VslsSessionTreeProvider();
      this.vslsSessionTreeProvider.register();
    }

    const statusItemKeys = new Map<string, { provider: string; team: Team }>();
    enabledProviders.forEach(provider => {
      const teams = providerTeams[provider];
      teams.forEach(team => {
        statusItemKeys.set(getStatusItemKey(provider, team), {
          provider,
          team
        });
      });
    });
    this.initializeStatusItems(statusItemKeys);
    this.initializeTreeViews(enabledProviders);

    const nonVslsProviders = enabledProviders.filter(
      provider => provider !== "vsls"
    );
    const showOnboarding = nonVslsProviders.length === 0;

    if (showOnboarding && !this.onboardingTree) {
      // We need to initialize the tree here
      this.onboardingTree = new OnboardingTreeProvider();
    } else if (!showOnboarding && !!this.onboardingTree) {
      // Dispose the tree as we don't need it anymore
      this.onboardingTree.dispose();
      this.onboardingTree = undefined;
    }
  }

  initializeStatusItems(
    newKeyMap: Map<string, { provider: string; team: Team }>
  ) {
    // Ensure new keys have status items in the map and
    // no longer used keys are removed.
    const existingKeysSet = new Set(Array.from(this.statusItems.keys()));
    const newKeysSet = new Set(Array.from(newKeyMap.keys()));
    const keysToRemove = difference(existingKeysSet, newKeysSet);
    const keysToAdd = difference(newKeysSet, existingKeysSet);

    keysToRemove.forEach(key => {
      const statusItem = this.statusItems.get(key);

      if (!!statusItem) {
        statusItem.dispose();
        this.statusItems.delete(key);
      }
    });

    keysToAdd.forEach(key => {
      const providerAndTeam = newKeyMap.get(key);

      if (!!providerAndTeam) {
        const { provider, team } = providerAndTeam;
        const isVsls = provider === "vsls";
        this.statusItems.set(
          key,
          new UnreadsStatusItem(provider, team, isVsls)
        );
      }
    });
  }

  initializeTreeViews(enabledProviders: string[]) {
    PROVIDERS_WITH_TREE.forEach(provider => {
      const hasProviderEnabled = enabledProviders.indexOf(provider) >= 0;
      setVsContext(`chat:${provider}`, hasProviderEnabled);
    });

    const enabledTreeProviders = new Set(
      enabledProviders.filter(p => PROVIDERS_WITH_TREE.indexOf(p) >= 0)
    );
    const existingTreeProviders = new Set(Array.from(this.treeViews.keys()));
    const treesToAdd = difference(enabledTreeProviders, existingTreeProviders);
    const treesToRemove = difference(
      existingTreeProviders,
      enabledTreeProviders
    );

    treesToRemove.forEach(treeProvider => {
      const treeView = this.treeViews.get(treeProvider);
      if (!!treeView) {
        treeView.dispose();
        this.treeViews.delete(treeProvider);
      }
    });

    treesToAdd.forEach(treeProvider => {
      this.treeViews.set(treeProvider, new TreeViewManager(treeProvider));
    });
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
    const treeViewForProvider = this.treeViews.get(provider);

    if (!!treeViewForProvider && this.parentManager.isAuthenticated(provider)) {
      const channelLabels = this.parentManager.getChannelLabels(provider);
      treeViewForProvider.updateData(channelLabels);
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
      provider,
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

    for (let entry of Array.from(this.treeViews.entries())) {
      let treeView = entry[1];
      treeView.dispose();
    }

    if (!!this.onboardingTree) {
      this.onboardingTree.dispose();
    }

    if (!!this.vslsSessionTreeProvider) {
      this.vslsSessionTreeProvider.dispose();
    }
  }
}
