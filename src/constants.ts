export const EXTENSION_ID = "karigari.chat";
export const OUTPUT_CHANNEL_NAME = "Slack Chat";
export const APP_INSIGHTS_KEY = "ac30cb4c-9282-4947-8652-4a0ac828f0ce";

export const LiveShareCommands = {
  START: "liveshare.start",
  END: "liveshare.end",
  JOIN: "liveshare.join"
};

// Setup token urls
export const SETUP_URL = "https://github.com/karigari/vscode-chat#setup";
export const SLACK_TOKEN_URL =
  "https://api.slack.com/custom-integrations/legacy-tokens";

// Is there a way to get this url from the vsls extension?
export const LIVE_SHARE_BASE_URL = `insiders.liveshare.vsengsaas.visualstudio.com`;
export const LIVE_SHARE_EXTENSION = `ms-vsliveshare.vsliveshare`;
export const TRAVIS_BASE_URL = `travis-ci.org`;

export const VSCodeCommands = {
  OPEN: "vscode.open",
  OPEN_SETTINGS: "workbench.action.openSettings"
};

export const SelfCommands = {
  OPEN: "extension.chat.openSlackPanel",
  CHANGE: "extension.chat.changeChannel",
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
