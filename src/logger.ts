import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "./constants";

export default class Logger {
  static output: vscode.OutputChannel | undefined;

  static setup() {
    this.output =
      this.output || vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
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
