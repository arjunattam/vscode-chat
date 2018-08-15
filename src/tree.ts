import * as vscode from "vscode";
import Store from "./store";
import { SelfCommands } from "./constants";
import * as str from "./strings";

interface ChannelItem {
  isHeading: Boolean;
  value: string;
  label: string;
}

export default class ChannelTreeProvider
  implements vscode.TreeDataProvider<ChannelItem> {
  onDidChangeTreeData?: vscode.Event<ChannelItem>;

  constructor(private store: Store) {}

  getTreeItem(
    element: ChannelItem
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    const { value, isHeading, label } = element;

    if (isHeading) {
      return new vscode.TreeItem(
        label,
        vscode.TreeItemCollapsibleState.Expanded
      );
    } else {
      const channel = this.store.channels.find(c => c.id === value);

      if (channel) {
        const treeItem = new vscode.TreeItem(label);
        treeItem.command = {
          command: SelfCommands.OPEN,
          title: "",
          arguments: [{ channel }]
        };
        return treeItem;
      }
    }
  }

  getChildren(element?: ChannelItem): vscode.ProviderResult<ChannelItem[]> {
    if (element) {
      const { value } = element;

      return new Promise(resolve => {
        const channels = this.store.getChannelLabels();
        // TODO: it is possible that channels is empty
        resolve(
          channels
            .filter(c => c.type === value.toLocaleLowerCase())
            .map(c => ({ isHeading: false, value: c.id, label: c.label }))
        );
      });
    } else {
      return new Promise(resolve => {
        const types = ["channel", "group", "im"];
        resolve(
          types.map(value => ({
            isHeading: true,
            value,
            label: this.getHeadingLabel(value)
          }))
        );
      });
    }
  }

  getHeadingLabel = type => {
    switch (type) {
      case "channel":
        return str.CHANNELS_LABEL;
      case "group":
        return str.GROUPS_LABEL;
      case "im":
        return str.IM_LABEL;
    }
  };

  getParent?(element: ChannelItem): vscode.ProviderResult<ChannelItem> {
    throw new Error("Method not implemented");
  }
}
