import * as vscode from "vscode";
import { IManager, Providers, Channel } from "../types";
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
  treeViews: TreeViewManager | undefined;
  onboardingTree: OnboardingTreeProvider | undefined;

  constructor(provider: string | undefined, private parentManager: IManager) {
    if (provider === Providers.vsls) {
      this.statusItem = new VslsChatStatusItem();
    } else {
      this.statusItem = new UnreadsStatusItem();
    }

    if (!!provider && PROVIDERS_WITH_TREE.indexOf(provider) >= 0) {
      // vsls does not support tree views
      this.treeViews = new TreeViewManager(provider);
    } else {
      this.onboardingTree = new OnboardingTreeProvider();
    }
  }

  updateStatusItem() {
    // TODO: channels can be undefined since this is called before
    // getChannelsPromise
    const { channels } = this.parentManager.store;
    const unreads = channels.map(channel => {
      return this.parentManager.getUnreadCount(channel);
    });
    const totalUnreads = unreads.reduce((a, b) => a + b, 0);
    const workspaceName = this.parentManager.getCurrentWorkspaceName();
    this.statusItem.updateCount(totalUnreads, workspaceName);
  }

  updateTreeViews() {
    if (this.parentManager.isAuthenticated() && !!this.treeViews) {
      const channelLabels = this.parentManager.getChannelLabels();
      // We could possibly split this function for channel-updates and user-updates
      // to avoid extra UI refresh calls.
      const imChannels: { [userId: string]: Channel } = {};
      const { users, currentUserInfo } = this.parentManager.store;

      if (!currentUserInfo) {
        // Since we are checking for authenticated in this method,
        // this additional condition would not matter.
        return;
      }

      Object.keys(users).forEach(userId => {
        const im = this.parentManager.getIMChannel(users[userId]);

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
    const { lastChannelId, users, currentUserInfo } = this.parentManager.store;
    const channel = this.parentManager.getChannel(lastChannelId);
    const { messages } = this.parentManager;
    let channelMessages = {};

    if (!!lastChannelId && lastChannelId in messages) {
      channelMessages = messages[lastChannelId];
    }

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
  }
}
