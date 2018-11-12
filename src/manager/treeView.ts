import * as vscode from "vscode";
import {
  UnreadsTreeProvider,
  ChannelTreeProvider,
  GroupTreeProvider,
  IMsTreeProvider,
  OnlineUsersTreeProvider
} from "../tree";
import { ChannelLabel, CurrentUser, Users, Channel } from "../types";

export class TreeViewManager implements vscode.Disposable {
  unreadsTreeProvider: UnreadsTreeProvider;
  channelsTreeProvider: ChannelTreeProvider;
  imsTreeProvider: IMsTreeProvider;
  groupsTreeProvider: GroupTreeProvider;
  // usersTreeProvider: OnlineUsersTreeProvider;

  constructor(provider: string) {
    // this.usersTreeProvider = new OnlineUsersTreeProvider(provider);
    this.unreadsTreeProvider = new UnreadsTreeProvider(provider);
    this.channelsTreeProvider = new ChannelTreeProvider(provider);
    this.groupsTreeProvider = new GroupTreeProvider(provider);
    this.imsTreeProvider = new IMsTreeProvider(provider);
  }

  updateData(
    channelLabels: ChannelLabel[],
    currentUser: CurrentUser,
    users: Users,
    imChannels: { [userId: string]: Channel }
  ) {
    this.unreadsTreeProvider.update(channelLabels);
    this.channelsTreeProvider.update(channelLabels);
    this.groupsTreeProvider.update(channelLabels);
    this.imsTreeProvider.update(channelLabels);
    // this.usersTreeProvider.updateData(currentUser, users, imChannels);
  }

  dispose() {
    this.unreadsTreeProvider.dispose();
    this.channelsTreeProvider.dispose();
    this.groupsTreeProvider.dispose();
    this.imsTreeProvider.dispose();
    // this.usersTreeProvider.dispose();
  }
}
