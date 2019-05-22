<h1 align="center">Team Chat for VS Code</h1>

<h3 align="center">Collaborate with your team and chat bots without context switches. Supports Slack, VS Live Share, and  Discord<sup>1</sup>.</h3>

<p align="center"><img src="https://raw.githubusercontent.com/karigari/vscode-chat/master/readme/preview.png" alt="Screenshot" width="800" /></p>

<p align="center">
    <a href="https://travis-ci.org/karigari/vscode-chat"><img src="https://travis-ci.org/karigari/vscode-chat.svg?branch=master" alt="Build status" /></a>
    <a href="https://marketplace.visualstudio.com/items?itemName=karigari.chat"><img src="https://vsmarketplacebadge.apphb.com/installs-short/karigari.chat.svg" alt="Installs" /></a>
    <a href="https://marketplace.visualstudio.com/items?itemName=karigari.chat"><img src="https://vsmarketplacebadge.apphb.com/rating-short/karigari.chat.svg" alt="Rating" /></a>
    <a href="https://aka.ms/vsls"><img src="https://aka.ms/vsls-badge" alt="Live Share enabled" /></a>
</p>

<sup>1</sup> Discord support is experimental. Please see [this doc](docs/DISCORD.md) for more details.

# Setup

1.  Install the extension from the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=karigari.chat)
2.  **For Slack**, run "Sign In with Slack" from the VS Code command palette
3.  **For Discord**, configure your token with instructions [given here](docs/DISCORD.md)
4.  To chat with **VS Live Share participants**, start a collaboration session and click the `Chat` status bar item. [See more](#vs-live-share).

Are you a Slack workspace admin? [Approve this app](https://slack.com/apps/ACB4LQKN1-slack-chat-for-vs-code) for your team.

# Features

- **Quiet notifications**: System notifications for chat can be painful, and this extension implements a subtle unread count instead.
- **Rich formatting**: Support for markdown code snippets, emojis, message reactions, and threads.
- **Native look-and-feel**: Use your dark theme and grid editor layout preferences with chat.

<p align="center">
    <img src="https://raw.githubusercontent.com/karigari/vscode-chat/master/readme/feature-1-magnifier.png" alt="Quiet notifications" width="290" />
    <img src="https://raw.githubusercontent.com/karigari/vscode-chat/master/readme/feature-2.png" alt="Rich formatting" width="290" />
    <img src="https://raw.githubusercontent.com/karigari/vscode-chat/master/readme/feature-3.png" alt="Theme and grid layout" width="290" />
</p>

# VS Live Share

## Companion chat

Team Chat is a light-weight companion chat for [VS Live Share](https://aka.ms/vsls), without any dependency on an existing backend like Slack or Discord.

To chat with your session peers, start a new session, and click the `Chat` status bar item. Optionally, you can also run the `Chat with VS Live Share participants` command.

The [VS Live Share Extension Pack](https://marketplace.visualstudio.com/items?itemName=MS-vsliveshare.vsliveshare-pack) includes the VS Live Share and Team Chat extensions for an easy one-click installation.

## With Slack and Discord

Optionally, you can also set up your Slack or Discord account to continuing using the same chat provider during a Live Share session.

With Slack/Discord, you can also start a new session with online team members easily. You can also use the slash commands `/live share` and `/live end` to start or end sessions in a chat window.

<p align="center"><img src="https://raw.githubusercontent.com/karigari/vscode-chat/master/readme/vsls-magnifier.png" alt="VS Live Share" width="800" /></p>

# Support

- **Configuration settings**: To use behind a network proxy and other settings, see [CONFIGURATION](docs/CONFIG.md).
- **Raise an issue**: Feel free to [report an issue](https://github.com/karigari/vscode-chat/issues), or find [me on Twitter](https://twitter.com/arjunattam) for any suggestions or support.

# Developer docs

- **Get started with contribution**: See [CONTRIBUTING](docs/CONTRIBUTING.md) to understand repo structure, building and testing.
- **New chat providers**: The implementation can be extended to support any chat provider, see [PROVIDERS](docs/PROVIDERS.md).
- **Vision**: Read the [VISION](VISION.md) doc to understand the motivation behind this extension and the roadmap ahead.
