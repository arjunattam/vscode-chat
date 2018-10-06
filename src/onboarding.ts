import * as vscode from "vscode";
import * as str from "./strings";
import { SelfCommands } from "./constants";
import { EventSource } from "./types";
import { hasExtensionPack, openUrl } from "./utils";
import IssueReporter from "./issues";

export const addNewProvider = async () => {
  const opts: vscode.InputBoxOptions = {
    prompt: "Which chat provider do you use?",
    placeHolder: "For example: Microsoft Teams, Telegram, Rocket.Chat"
  };
  const input = await vscode.window.showInputBox(opts);

  if (!!input) {
    const title = `Add new chat provider: ${input}`;
    const body = `My chat provider is ${input}`;
    IssueReporter.openNewIssue(title, body);
  }
};

export const setupSlack = () => {
  vscode.commands.executeCommand(SelfCommands.SIGN_IN, {
    source: EventSource.info,
    service: "slack"
  });
};

export const setupDiscord = () => {
  openUrl(
    "https://github.com/karigari/vscode-chat/blob/master/docs/DISCORD.md"
  );
};

export const askForAuth = async () => {
  const actionItems = [str.SETUP_SLACK, str.SETUP_DISCORD];

  if (hasExtensionPack()) {
    actionItems.push(str.ADD_NEW_PROVIDER);
  }

  const selected = await vscode.window.showInformationMessage(
    str.TOKEN_NOT_FOUND,
    ...actionItems
  );

  switch (selected) {
    case str.SETUP_SLACK:
      setupSlack();
      break;
    case str.SETUP_DISCORD:
      setupDiscord();
      break;
    case str.ADD_NEW_PROVIDER:
      addNewProvider();
      break;
  }
};

class CustomOnboardingTreeItem extends vscode.TreeItem {
  constructor(label: string, command: string) {
    super(label);
    this.command = {
      command,
      title: "",
      arguments: [{ source: EventSource.activity }]
    };
  }
}

interface OnboardingTreeNode {
  label: string;
  command: string;
}

const OnboardingCommands = {
  SETUP_SLACK: "extension.chat.onboarding.slack",
  SETUP_DISCORD: "extension.chat.onboarding.discord",
  ADD_NEW: "extension.chat.onboarding.addNew"
};

export class OnboardingTreeProvider
  implements vscode.TreeDataProvider<OnboardingTreeNode>, vscode.Disposable {
  private vslsViewId = "chat.treeView.onboarding.vsls";
  private mainViewId = "chat.treeView.onboarding.main";
  private _disposables: vscode.Disposable[] = [];

  constructor() {
    this._disposables.push(
      vscode.window.registerTreeDataProvider(this.vslsViewId, this),
      vscode.window.registerTreeDataProvider(this.mainViewId, this),
      vscode.commands.registerCommand(
        OnboardingCommands.SETUP_SLACK,
        setupSlack
      ),
      vscode.commands.registerCommand(
        OnboardingCommands.SETUP_DISCORD,
        setupDiscord
      ),
      vscode.commands.registerCommand(
        OnboardingCommands.ADD_NEW,
        addNewProvider
      )
    );
  }

  dispose() {
    this._disposables.forEach(dispose => dispose.dispose());
  }

  getChildren(element?: OnboardingTreeNode) {
    return Promise.resolve([
      { label: str.SETUP_SLACK, command: OnboardingCommands.SETUP_SLACK },
      { label: str.SETUP_DISCORD, command: OnboardingCommands.SETUP_DISCORD },
      {
        label: str.ADD_NEW_PROVIDER,
        command: OnboardingCommands.ADD_NEW
      }
    ]);
  }

  getTreeItem(element: OnboardingTreeNode): vscode.TreeItem {
    const { label, command } = element;
    return new CustomOnboardingTreeItem(label, command);
  }
}
