import * as vscode from "vscode";
import { IManager, Providers } from "../types";
import { TreeViewManager } from "./treeView";
import {
  BaseStatusItem,
  UnreadsStatusItem,
  VslsChatStatusItem
} from "../status";
import { OnboardingTreeProvider } from "../onboarding";
import { SelfCommands } from "../constants";

const PROVIDERS_WITH_TREE = ["slack", "discord"];

export class ViewsManager implements vscode.Disposable {
  statusItem: BaseStatusItem;
  treeViews: TreeViewManager;
  onboardingTree: OnboardingTreeProvider;

  constructor(provider: string, private parent: IManager) {
    if (provider === Providers.vsls) {
      this.statusItem = new VslsChatStatusItem();
    } else {
      this.statusItem = new UnreadsStatusItem();
    }

    if (PROVIDERS_WITH_TREE.indexOf(provider) >= 0) {
      // vsls does not support tree views
      this.treeViews = new TreeViewManager(provider);
    } else {
      this.onboardingTree = new OnboardingTreeProvider();
    }
  }

  updateStatusItem() {
    const { channels } = this.parent.store;
    const unreads = channels.map(channel => {
      return this.parent.getUnreadCount(channel);
    });
    const totalUnreads = unreads.reduce((a, b) => a + b, 0);
    const workspaceName = this.parent.getCurrentWorkspaceName();
    this.statusItem.updateCount(totalUnreads, workspaceName);
  }

  updateTreeViews() {
    if (this.parent.isAuthenticated() && !!this.treeViews) {
      const channelLabels = this.parent.getChannelLabels();
      // We could possibly split this function for channel-updates and user-updates
      // to avoid extra UI refresh calls.
      const imChannels = {};
      const { users, currentUserInfo } = this.parent.store;

      Object.keys(users).forEach(userId => {
        const im = this.parent.getIMChannel(users[userId]);

        if (!!im) {
          imChannels[userId] = im;
        }
      });

      this.treeViews.updateData(
        channelLabels,
        currentUserInfo,
        users,
        imChannels
      );
    }
  }

  updateWebview() {
    const { lastChannelId, users, currentUserInfo } = this.parent.store;
    const channel = this.parent.getChannel(lastChannelId);
    const { messages } = this.parent;
    const channelMessages =
      lastChannelId in this.parent.messages ? messages[lastChannelId] : {};

    vscode.commands.executeCommand(SelfCommands.SEND_TO_WEBVIEW, {
      uiMessage: {
        messages: channelMessages,
        users,
        currentUser: currentUserInfo,
        channel,
        statusText: ""
      }
    });
  }

  updateVslsStatus = (isActive: boolean) => {
    if (isActive) {
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
  }
}
