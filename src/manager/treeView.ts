import * as vscode from "vscode";
import {
  WorkspacesTreeProvider,
  ChannelTreeProvider,
  GroupTreeProvider,
  IMsTreeProvider
} from "../tree";

export class TreeViewManager implements vscode.Disposable {
  workspacesTreeProvider: WorkspacesTreeProvider;
  channelsTreeProvider: ChannelTreeProvider;
  imsTreeProvider: IMsTreeProvider;
  groupsTreeProvider: GroupTreeProvider;

  constructor(public provider: string) {
    this.workspacesTreeProvider = new WorkspacesTreeProvider(provider);
    this.channelsTreeProvider = new ChannelTreeProvider(provider);
    this.groupsTreeProvider = new GroupTreeProvider(provider);
    this.imsTreeProvider = new IMsTreeProvider(provider);
  }

  updateData(currentUserInfo: CurrentUser, channelLabels: ChannelLabel[]) {
    this.workspacesTreeProvider.updateCurrentUser(currentUserInfo);
    this.workspacesTreeProvider.updateChannels(channelLabels);
    this.channelsTreeProvider.updateChannels(channelLabels);
    this.groupsTreeProvider.updateChannels(channelLabels);
    this.imsTreeProvider.updateChannels(channelLabels);
  }

  dispose() {
    this.workspacesTreeProvider.dispose();
    this.channelsTreeProvider.dispose();
    this.groupsTreeProvider.dispose();
    this.imsTreeProvider.dispose();
  }
}
