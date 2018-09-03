# Chat providers (draft)

Chat providers can be added by implementing the `IChatProvider` interface, see [src/interfaces/index.ts](src/interfaces/index.ts)

## Use-cases

1. Users can send and receive messages for a chat channel in a webview
2.
3. VSLS specific: Users can see other online users in the VSLS tree view
4. VSLS specific: Users can invite users or channels for a VSLS collaboration session

## Authentication

Slack uses OAuth with `client` scope.

The result of a successful auth flow is a token string which is saved in the keychain.

## Real-time messaging

## Presence
