import * as vscode from "vscode";
import { ChannelTreeItem } from "./treeItem";
import { equals, notUndefined } from "../utils";

export interface ISortingFunction {
  (a: ChannelLabel, b: ChannelLabel): number;
}

export interface IFilterFunction {
  (a: ChannelLabel): boolean;
}

export class BaseChannelsListTreeProvider
  implements vscode.TreeDataProvider<ChatTreeNode>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChatTreeNode>();
  readonly onDidChangeTreeData? = this._onDidChangeTreeData.event;
  protected _disposables: vscode.Disposable[] = [];

  protected sortingFn: ISortingFunction = (a: ChannelLabel, b: ChannelLabel) =>
    a.label.localeCompare(b.label);
  protected filterFn: IFilterFunction = () => true;
  protected channelLabels: ChannelLabel[] = [];

  constructor(protected providerName: string, protected viewId: string) {
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.viewId, this)
    );
  }

  dispose() {
    this._disposables.forEach(dispose => dispose.dispose());
  }

  async refresh(treeItem?: ChatTreeNode) {
    return treeItem
      ? this._onDidChangeTreeData.fire(treeItem)
      : this._onDidChangeTreeData.fire();
  }

  getLabelsObject(
    channeLabels: ChannelLabel[]
  ): { [channelId: string]: ChannelLabel } {
    let result: { [channelId: string]: ChannelLabel } = {};
    channeLabels.forEach(label => {
      const { channel } = label;
      result[channel.id] = label;
    });
    return result;
  }

  updateChannels(channelLabels: ChannelLabel[]) {
    const filtered = channelLabels.filter(this.filterFn).sort(this.sortingFn);
    const prevLabels = this.getLabelsObject(this.channelLabels);
    const newLabels = this.getLabelsObject(filtered);
    this.channelLabels = filtered;
    const prevKeys = new Set(Object.keys(prevLabels));
    const newKeys = new Set(Object.keys(newLabels));

    if (!equals(prevKeys, newKeys)) {
      // We have new channels, so we are replacing everything
      // Can potentially optimize this
      return this.refresh();
    }

    // Looking for changes in presence and unread
    Object.keys(newLabels).forEach(channelId => {
      const newLabel = newLabels[channelId];
      const prevLabel = prevLabels[channelId];

      if (prevLabel.unread !== newLabel.unread) {
        // Can we send just this element?
        this.refresh();
      }

      if (prevLabel.presence !== newLabel.presence) {
        // Can we send just this element?
        this.refresh();
      }
    });
  }

  getParent = (element: ChatTreeNode): vscode.ProviderResult<ChatTreeNode> => {
    const { channel } = element;

    if (!!channel && !!channel.categoryName) {
      return Promise.resolve(this.getItemForCategory(channel.categoryName));
    }
  };

  getChildren = (
    element?: ChatTreeNode
  ): vscode.ProviderResult<ChatTreeNode[]> => {
    if (!element) {
      return this.getRootChildren();
    }

    if (!!element && element.isCategory) {
      return this.getChildrenForCategory(element);
    }
  };

  getChildrenForCategory = (
    element: ChatTreeNode
  ): vscode.ProviderResult<ChatTreeNode[]> => {
    const { label: category } = element;
    const channels = this.channelLabels
      .filter(channelLabel => {
        const { channel } = channelLabel;
        return channel.categoryName === category;
      })
      .map(this.getItemForChannel);
    return Promise.resolve(channels);
  };

  getRootChildren = (): vscode.ProviderResult<ChatTreeNode[]> => {
    const channelsWithoutCategories = this.channelLabels
      .filter(channelLabel => !channelLabel.channel.categoryName)
      .map(this.getItemForChannel);
    const categories: string[] = this.channelLabels
      .map(channelLabel => channelLabel.channel.categoryName)
      .filter(notUndefined);
    const uniqueCategories = categories
      .filter((item, pos) => categories.indexOf(item) === pos)
      .map(category => this.getItemForCategory(category));
    return Promise.resolve([...channelsWithoutCategories, ...uniqueCategories]);
  };

  getItemForChannel = (channelLabel: ChannelLabel): ChatTreeNode => {
    const { label, presence, channel } = channelLabel;
    return {
      label,
      presence,
      channel,
      isCategory: false,
      user: undefined,
      providerName: this.providerName
    };
  };

  getItemForCategory = (category: string): ChatTreeNode => {
    return {
      label: category,
      presence: UserPresence.unknown,
      isCategory: true,
      channel: undefined,
      user: undefined,
      providerName: this.providerName
    };
  };

  getTreeItem = (element: ChatTreeNode): vscode.TreeItem => {
    const { label, presence, isCategory, channel, user } = element;
    const treeItem = new ChannelTreeItem(
      label,
      presence,
      isCategory,
      this.providerName,
      channel,
      user
    );
    return treeItem;
  };
}
