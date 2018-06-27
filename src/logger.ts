import * as vscode from "vscode";

const CHANNEL_NAME = "Slack Chat";

export default class Logger {
  static output: vscode.OutputChannel | undefined;

  static setup() {
    this.output =
      this.output || vscode.window.createOutputChannel(CHANNEL_NAME);
  }

  private static get timestamp(): string {
    const now = new Date();
    return `[${now
      .toISOString()
      .replace(/T/, " ")
      .replace(/\..+/, "")}:${("00" + now.getUTCMilliseconds()).slice(-3)}]`;
  }

  static log(message): void {
    if (this.output === undefined) {
      this.setup();
    }

    if (this.output) {
      const logLine = `${this.timestamp}: ${message}`;
      this.output.appendLine(logLine);
    }
  }
}
