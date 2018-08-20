export const CONFIG_ROOT = "chat";
export const EXTENSION_ID = "karigari.chat";
export const OUTPUT_CHANNEL_NAME = "Slack Chat";
export const APP_INSIGHTS_KEY = "ac30cb4c-9282-4947-8652-4a0ac828f0ce";

export const LiveShareCommands = {
  START: "liveshare.start",
  END: "liveshare.end",
  JOIN: "liveshare.join"
};

// Is there a way to get this url from the vsls extension?
export const LIVE_SHARE_BASE_URL = `insiders.liveshare.vsengsaas.visualstudio.com`;
export const VSLS_EXTENSION_ID = `ms-vsliveshare.vsliveshare`;
export const TRAVIS_BASE_URL = `travis-ci.org`;

export const VSCodeCommands = {
  OPEN: "vscode.open",
  OPEN_SETTINGS: "workbench.action.openSettings"
};

export const SelfCommands = {
  OPEN: "extension.chat.openSlackPanel",
  CHANGE: "extension.chat.changeChannel",
  SIGN_IN: "extension.chat.authenticate",
  CONFIGURE_TOKEN: "extension.chat.configureToken",
  LIVE_SHARE: "extension.chat.startLiveShare"
};

export const SLASH_COMMANDS = {
  live: {
    share: {
      action: LiveShareCommands.START,
      options: { suppressNotification: true }
    },
    end: { action: LiveShareCommands.END, options: {} }
  }
};

// Reverse commands are acted on when received from Slack
export const REVERSE_SLASH_COMMANDS = {
  live: {
    request: {}
  }
};

// Internal uri schemes
export const TRAVIS_SCHEME = "chat-travis-ci";

// Slack App
export const SLACK_OAUTH = `https://slack.com/oauth/authorize?scope=client&client_id=282186700213.419156835749`;
