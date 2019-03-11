# Chat providers

The goal of this extension is to open up support for other chat providers, in addition to Slack and Discord. Chat providers can be added by implementing the `IChatProvider` [interface](src/interfaces/index.ts). Providers will use a common set of types for `User`, `Channel`, `Message`.

For reference, see the implementation [for Slack](src/slack/index.ts) and [for Discord](src/discord/index.ts).

## Supported features

The extension supports the following features for Slack. Other chat providers can implement one or more features, depending on their API.

1. [Authentication](#authentication): Users can sign in with chat provider's OAuth
2. [Messaging](#messaging): Users can open a chat channel in a webview, and then send and receive messages
3. [Channels list](#channels-list): Users can see the list of public channels, direct messages and private groups (with unread counts) in the tree view
4. [Unreads](#unreads): Users can see the unread count in the status bar
5. [Presence](#presence): Users can see other online users in the Live Share tree view (requires VS Live Share)
6. [Collaboration invites](#collaboration-invites): Users can invite users or channels for a Live Share collaboration session (requires VS Live Share)

## Authentication

Slack uses OAuth with `client` scope. The result of a successful auth flow is a token string which is saved in the keychain. The other features are dependent on a successful authentication.

Requirements for providers

- Provide a "Sign in with X" link to launch OAuth flow
- Auth flow should return a token string that can be saved to system keychain

## Messaging

In addition to normal send/receive of messages in real-time, the Slack integration also supports threaded message replies, message reactions and file attachments. These are incorporated in the `Message` data type.

Requirements for providers

- API support to receive messages in real-time (Slack uses websocket)
- API support to send messages, as the authenticated user (not a bot)
- Optionally: thread replies, emoji reactions, file attachments

## Channels list

Slack supports three channel types: `channel` (public channels), `im` (direct messages), and `group` (private groups). These are fetched (from API, and then onwards from local storage) when the extension is activated.

Requirements for providers

- API support to fetch channels and users

## Unreads

The unread count can be historical (unread messages before user comes online) and in real-time (new messages when the user is online).

Requirements for providers

- Historical unreads: API support to return unread count for every channel
- Real-time unreads: The real-time messaging API can be used to update a running unread count for new messages
- API support to mark messages as read (which takes the count to 0)
- If the provider has other clients, then the API should support real-time updates to maintain unread count consistent with the other clients.

## Presence

User presence (online/offline status) shows green dots next to direct messaging channels in the tree view. When VS Live Share is available, a list of online users is shown in the Live Share activity bar, to send one-click collaboration invites.

Requirements for providers

- API support for real-time support for user presence updates

## Collaboration invites

To start a VS Live Share collaboration session, the extension supports one-click collaboration invites. The requirements for this are similar to the messaging feature.

Requirements for providers

- API support to receive real-time messages in the background
- API support to send messages
