[![](https://vsmarketplacebadge.apphb.com/version-short/karigari.chat.svg)](https://marketplace.visualstudio.com/items?itemName=karigari.chat)
[![Build Status](https://travis-ci.org/karigari/vscode-chat.svg?branch=master)](https://travis-ci.org/karigari/vscode-chat)
[![](https://img.shields.io/badge/join-slack-orange.svg)](https://join.slack.com/t/karigarihq/shared_invite/enQtMzM5NzQxNjQxNTA1LTM0ZDFhNWQ3YmEyYmExZTY1ODJmM2U3NzExM2E0YmQxODcxYTgwYzczOTVkOGY5ODk2MWE0MzE2ODliNGU1ZDc) [![Greenkeeper badge](https://badges.greenkeeper.io/karigari/vscode-chat.svg)](https://greenkeeper.io/)

# Slack Chat for VSCode 💬

![Demo gif](public/example.gif)

Send and receive Slack Chat without leaving your editor. Works with public and private channels, and integrates [VS Live Share](https://visualstudio.microsoft.com/services/live-share/) in your conversations.

## Setup

1.  Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=karigari.chat)
2.  Generate a [Slack legacy token](https://api.slack.com/custom-integrations/legacy-tokens)
3.  Add the token to your settings (File/Code > Preferences > Settings)

```json
{
  "chat.slack.legacyToken": "xoxp-2854..."
}
```

![Settings](public/settings.png)

## Features

- [Open and Switch Channels](#open-and-switch-channels)
- [Integrated with VS Live Share](#integrated-with-vs-live-share)
- [Native Look-and-feel](#native-look-and-feel)

### Open and Switch Channels

Open the [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette), and select **Slack: Open** or **Slack: Change Channel** to navigate your Slack workspace.

![Slack commands](public/commands.gif)

### Integrated with VS Live Share

Type `/live share` in your message box to start a VS Live Share session. This will send the invitation link to the channel. When you're done, type `/live end` to end.

![Live Share](public/live-share.gif)

### Native Look-and-feel

Slack Chat fits in natively with VSCode, with dark and light themes. Place it within vertical/horizontal window splits, just like your editor.

![Light theme](public/themes.gif)

## Contribute

The repo is actively developed, and you are welcome to [submit feature requests](https://github.com/karigari/vscode-chat/issues/new) and pull requests. The repo has two parts that communicate with message passing.

- `src/ui/...` — is the webview UI code, written with Vue.js
- `src/...` — everything else except UI. This is the main extension code, written in TypeScript

## Support

Feel free to [raise an issue](https://github.com/karigari/vscode-chat/issues), or [tweet at us](https://twitter.com/getrubberduck) for any questions or support.

You can also reach me directly at arjun@rubberduck.io

## Credits

The icon for this package is by [icons8](https://icons8.com).
