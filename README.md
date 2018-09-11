<h1 align="center">Team Chat for VS Code</h1>

<h3 align="center">Collaborate with your team and bots, without context switches. Supports Slack and Discord.</h3>

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

- **Quiet notifications**: status bar item
- **Rich formatting**: code snippets, emojis
- **Native look and feel**: theme, grid layout

<p align="center">
    <img src="readme/vsls.png" alt="VS Live Share" width="200" />
    <img src="readme/vsls.png" alt="VS Live Share" width="200" />
    <img src="readme/vsls.png" alt="VS Live Share" width="200" />
</p>

# VS Live Share

Online users can be invited for a [VS Live Share](https://aka.ms/vsls) collaboration session. You can also use slash commands `/live share` and `/live end` to start or stop collaboration sessions.

<p align="center"><img src="readme/vsls-magnifier.png" alt="VS Live Share" width="800" /></p>

# Support

- **Configuration settings**: To use behind a proxy and other settings, see [CONFIGURATION](docs/CONFIG.md).
- **Raise an issue**: Feel free to [report an issue](https://github.com/karigari/vscode-chat/issues), or find [me on Twitter](https://twitter.com/arjunattam) for any suggestions or support.

# Developer docs

- **Get started with contribution**: See [CONTRIBUTING](docs/CONTRIBUTING.md) to understand repo structure, building and testing.
- **Add new chat providers**: [PROVIDERS](docs/PROVIDERS.md) covers implementation details for any third-party chat provider.
- **Vision**: Read the [VISION](VISION.md) doc to understand the motivation behind this extension and the roadmap ahead.
