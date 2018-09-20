<h1 align="center">Team Chat for VS Code</h1>

<h3 align="center">Collaborate with your team and chat bots without context switches. Supports Slack and Discord.</h3>

<p align="center"><img src="readme/preview.png" alt="Screenshot" width="800" /></p>

<p align="center">
    <a href="https://travis-ci.org/karigari/vscode-chat"><img src="https://travis-ci.org/karigari/vscode-chat.svg?branch=master" alt="Build status" /></a>
    <a href="https://marketplace.visualstudio.com/items?itemName=karigari.chat"><img src="https://vsmarketplacebadge.apphb.com/installs-short/karigari.chat.svg" alt="Installs" /></a>
    <a href="https://marketplace.visualstudio.com/items?itemName=karigari.chat"><img src="https://img.shields.io/vscode-marketplace/r/karigari.chat.svg" alt="Rating" /></a>
    <a href="https://join.slack.com/t/karigarihq/shared_invite/enQtMzM5NzQxNjQxNTA1LTM0ZDFhNWQ3YmEyYmExZTY1ODJmM2U3NzExM2E0YmQxODcxYTgwYzczOTVkOGY5ODk2MWE0MzE2ODliNGU1ZDc"><img src="https://img.shields.io/badge/join-slack-orange.svg" alt="Join Slack" /></a>
</p>

# Setup

1.  Install the extension from the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=karigari.chat)
2.  **For Slack**, run "Sign In with Slack" from the VS Code command palette
3.  **For Discord**, configure your token with instructions [given here](docs/DISCORD.md)

Are you a Slack workspace admin? [Approve this app](https://slack.com/apps/ACB4LQKN1-slack-chat-for-vs-code) for your team.

# Features

- **Quiet notifications**: System notifications for chat can be painful, and this extension implements a subtle unread count instead.
- **Rich formatting**: Support for markdown code snippets, emojis, message reactions, and threads.
- **Native look-and-feel**: Use your dark theme and grid editor layout preferences with chat.

<p align="center">
    <img src="readme/feature-1.png" alt="Quiet notifications" width="290" />
    <img src="readme/feature-2.png" alt="Rich formatting" width="290" />
    <img src="readme/feature-3.png" alt="Theme and grid layout" width="290" />
</p>

# VS Live Share

Start a [VS Live Share](https://aka.ms/vsls) collaboration session with your online team members, with just a click. You can also use slash commands `/live share` and `/live end` to start or end sessions.

<p align="center"><img src="readme/vsls.png" alt="VS Live Share" width="800" /></p>

# Support

- **Configuration settings**: To use behind a network proxy and other settings, see [CONFIGURATION](docs/CONFIG.md).
- **Raise an issue**: Feel free to [report an issue](https://github.com/karigari/vscode-chat/issues), or find [me on Twitter](https://twitter.com/arjunattam) for any suggestions or support.

# Developer docs

- **Get started with contribution**: See [CONTRIBUTING](docs/CONTRIBUTING.md) to understand repo structure, building and testing.
- **New chat providers**: The implementation can be extended to support any chat provider, see [PROVIDERS](docs/PROVIDERS.md).
- **Vision**: Read the [VISION](VISION.md) doc to understand the motivation behind this extension and the roadmap ahead.
