# Discord Setup

## Warning

The Discord integration involves an unofficial approach to getting the token, and is not recommended. The approach is similar to how users can potentially automate their logins ("create self-bots"), which are not allowed by the Discord ToS.

The goal is to move to [Discord RPC](https://discordapp.com/developers/docs/topics/rpc#proxied-api-requests) in the near-term, which supports proxied API/websocket requests with OAuth. Discord RPC is in private beta at the moment.

If you have any suggestions to improve this flow, please [create an issue](https://github.com/karigari/vscode-chat/issues).

## Obtaining the token

To set up Discord inside VS Code, you need to have your **Discord token**. To obtain your token, follow the steps [given here](https://discordhelp.net/discord-token).

This is an unofficial token setup, one that is used by other Discord clients ([Discline](https://github.com/MitchWeaver/Discline), [terminal-discord](https://github.com/xynxynxyn/terminal-discord)), and the recommended approach by a Discord team member, as [given here](https://github.com/discordapp/discord-api-docs/issues/69#issuecomment-223886862):

> Instead, log in on the discord client, pop open the web inspector, (ctrl/cmd shift I), and type localStorage.token in the console to get your auth token.

## Configuring the token

Once you have the token, run the following commands from the VS Code command palette:

1. Run **Chat: Configure Access Token**, select "Discord", and then paste your token in the input box. The token will be saved securely in your system keychain.

2. Next, you will be prompted to choose your primary Discord guild. If you don't want to select now, you can run the **Chat: Change Workspace** command later.
