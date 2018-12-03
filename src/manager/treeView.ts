import * as vscode from "vscode";
import {
  UnreadsTreeProvider,
  ChannelTreeProvider,
  GroupTreeProvider,
  IMsTreeProvider
} from "../tree";

export class TreeViewManager implements vscode.Disposable {
  unreadsTreeProvider: UnreadsTreeProvider;
  channelsTreeProvider: ChannelTreeProvider;
  imsTreeProvider: IMsTreeProvider;
  groupsTreeProvider: GroupTreeProvider;

  constructor(provider: string, team: Team) {
    this.unreadsTreeProvider = new UnreadsTreeProvider(provider, team);
    this.channelsTreeProvider = new ChannelTreeProvider(provider, team);
    this.groupsTreeProvider = new GroupTreeProvider(provider, team);
    this.imsTreeProvider = new IMsTreeProvider(provider, team);
  }

  updateData(channelLabels: ChannelLabel[]) {
    this.unreadsTreeProvider.update(channelLabels);
    this.channelsTreeProvider.update(channelLabels);
    this.groupsTreeProvider.update(channelLabels);
    this.imsTreeProvider.update(channelLabels);
  }

  dispose() {
    this.unreadsTreeProvider.dispose();
    this.channelsTreeProvider.dispose();
    this.groupsTreeProvider.dispose();
    this.imsTreeProvider.dispose();
  }
}
