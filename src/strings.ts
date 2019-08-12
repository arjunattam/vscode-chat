export const CHANGE_CHANNEL_TITLE = "Select a channel";

export const CHANGE_WORKSPACE_TITLE = "Select a workspace";

export const CHANGE_PROVIDER_TITLE = "Select a provider";

export const RELOAD_CHANNELS = "Reload Channels...";

export const TOKEN_NOT_FOUND = "Setup Team Chat to work for your account.";

export const SETUP_SLACK = "Set up Slack";

export const SETUP_DISCORD = "Set up Discord";

export const REPORT_ISSUE = "Report issue";

export const RETRY = "Retry";

export const KEYCHAIN_ERROR =
  "The Team Chat extension is unable to access the system keychain.";

export const TOKEN_PLACEHOLDER = "Paste token here";

export const AUTH_FAILED_MESSAGE =
  "Sign in failed. Help us get better by reporting an issue.";

export const INVALID_TOKEN = (provider: string) =>
  `The ${provider} token cannot be validated. Please enter a valid token.`;

export const INVALID_COMMAND = (text: string) =>
  `${text} is not a recognised command.`;

export const UPLOADED_FILE = (link: string) => `uploaded a file: ${link}`;

export const LIVE_REQUEST_MESSAGE = "wants to start a Live Share session";

export const LIVE_SHARE_INVITE = (name: string) =>
  `${name} has invited you to a Live Share collaboration session.`;

export const LIVE_SHARE_CHAT_NO_SESSION =
  "Chat requires an active Live Share collaboration session.";

export const LIVE_SHARE_INFO_MESSAGES = {
  started: "_has started the Live Share session_",
  ended: "_has ended the Live Share session_",
  joined: "_has joined the Live Share session_",
  left: "_has left the Live Share session_"
};

export const LIVE_SHARE_CONFIRM_SIGN_OUT = (provider: string) =>
  `To use chat over VS Live Share, you need to sign out of your ${provider} account.`;

export const SIGN_OUT = "Sign out";

export const SELECT_SELF_PRESENCE = "Select your presence status";

export const SELECT_DND_DURATION = "Select snooze duration for Slack";

export const UNABLE_TO_MATCH_CONTACT =
  "Could not start chat: unable to match this contact.";

export const NO_LIVE_SHARE_CHAT_ON_HOST = 
  "Live Share Chat is unavailable for this session, since the host does not have it.";
