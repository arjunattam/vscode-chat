# Slack authorization

Many users have reported running into `access_denied` issues on Slack, and this doc attempts to list potential solutions to the problem.

In case you have questions about permission levels or what this extension accesses, please report an issue with your question.

## Admin approval required

Some workspaces require an explicit admin approval before users can install specific apps.

If your workspace needs this, please forward [this link](https://slack.com/apps/ACB4LQKN1-slack-chat-for-vs-code) to your workspace admins.

## Slack App Directory

Some workspaces also restrict apps that are only approved by the Slack app review process. Getting this done is in our backlog, and you can track progress in [this issue](https://github.com/karigari/vscode-chat/issues/78).

For now, you will need to manually approve the app for your workspace. This can be done by any admin of the workspace. Please use [this link](https://slack.com/apps/ACB4LQKN1-slack-chat-for-vs-code) for that.

## Free workspace app limit

If you are on a free Slack workspace, you can only have 10 installed apps. Attempting to install any more gives an `access_denied` error. To make this work without upgrading your Slack plan, you will need to remove an existing app.
