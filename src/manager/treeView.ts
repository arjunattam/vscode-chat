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

  constructor(public provider: string) {
    this.unreadsTreeProvider = new UnreadsTreeProvider(provider);
    this.channelsTreeProvider = new ChannelTreeProvider(provider);
    this.groupsTreeProvider = new GroupTreeProvider(provider);
    this.imsTreeProvider = new IMsTreeProvider(provider);
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
