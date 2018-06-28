export const LiveShareCommands = {
  START: "liveshare.start",
  END: "liveshare.end",
  JOIN: "liveshare.join"
};

export const VSCodeCommands = {
  OPEN: "vscode.open"
};

export const COMMAND_ACTIONS = {
  live: {
    share: {
      action: LiveShareCommands.START,
      options: { suppressNotification: true }
    },
    end: { action: LiveShareCommands.END, options: {} }
  }
};
