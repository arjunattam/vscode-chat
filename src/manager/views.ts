import * as vscode from "vscode";
import { TreeViewManager } from "./treeView";
import {
  BaseStatusItem,
  UnreadsStatusItem,
  VslsChatStatusItem
} from "../status";
import { OnboardingTreeProvider } from "../onboarding";
import { SelfCommands } from "../constants";
import { VslsSessionTreeProvider } from "../tree/vsls";
import { VSLS_CHAT_CHANNEL } from "../vslsChat/utils";
import { setVsContext } from "../utils";

const PROVIDERS_WITH_TREE = ["slack", "discord"];

export class ViewsManager implements vscode.Disposable {
  statusItem: BaseStatusItem;
  treeViews: TreeViewManager | undefined;
  onboardingTree: OnboardingTreeProvider | undefined;
  vslsSessionTreeProvider: VslsSessionTreeProvider | undefined; // for vsls chat tree item

  constructor(enabledProviders: string[], private parentManager: IManager) {
    const hasVslsEnabled = enabledProviders.indexOf("vsls") >= 0;
    const showOnboarding = enabledProviders.length === 1 && hasVslsEnabled;

    if (hasVslsEnabled) {
      // TODO: merge status bar item behaviour --> vsls will also only show unreads
      this.statusItem = new VslsChatStatusItem();
      this.vslsSessionTreeProvider = new VslsSessionTreeProvider();
      this.vslsSessionTreeProvider.register();
    } else {
      this.statusItem = new UnreadsStatusItem();
    }

    enabledProviders.forEach(provider => {
      if (PROVIDERS_WITH_TREE.indexOf(provider) >= 0) {
        this.treeViews = new TreeViewManager(provider as string);
      }
    });

    PROVIDERS_WITH_TREE.forEach(treeProvider => {
      const hasProviderEnabled = enabledProviders.indexOf(treeProvider) >= 0;
      setVsContext(`chat:${treeProvider}`, hasProviderEnabled);
    });

    if (showOnboarding) {
      this.onboardingTree = new OnboardingTreeProvider();
    }
  }

  updateStatusItem() {
    // TODO: this provider is incorrect
    const provider = this.parentManager.getCurrentProvider();
    const channels = this.parentManager.store.getChannels(provider);
    const unreads = channels.map(channel => {
      return this.parentManager.getUnreadCount(provider, channel);
    });
    const totalUnreads = unreads.reduce((a, b) => a + b, 0);
    const workspaceName = this.parentManager.getCurrentWorkspaceName();
    this.statusItem.updateCount(totalUnreads, workspaceName);
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

  updateWebview(provider: string) {
    const lastChannelId = this.parentManager.store.getLastChannelId(provider);
    const users = this.parentManager.store.getUsers(provider);
    const currentUserInfo = this.parentManager.store.getCurrentUser(provider);
    const channel = this.parentManager.getChannel(provider, lastChannelId);
    const messages = this.parentManager.getMessages(provider);
    let channelMessages = {};

    if (!!lastChannelId && lastChannelId in messages) {
      channelMessages = messages[lastChannelId];
    }

    if (!!channel && currentUserInfo) {
      let uiMessage: UIMessage = {
        currentProvider: provider,
        messages: channelMessages,
        users,
        currentUser: currentUserInfo,
        channel,
        statusText: ""
      };

      vscode.commands.executeCommand(SelfCommands.SEND_TO_WEBVIEW, {
        uiMessage
      });
    }
  }

  updateVslsStatus = (isSessionActive: boolean) => {
    if (isSessionActive) {
      this.statusItem.show();
    } else {
      this.statusItem.hide();
    }
  };

  dispose() {
    if (!!this.statusItem) {
      this.statusItem.dispose();
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
