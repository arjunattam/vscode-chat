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
    return now.toLocaleString();
  }

  private static logOnConsole(message: string): void {
    console.log(message);
  }

  private static logOnOutput(message: string): void {
    if (this.output === undefined) {
      this.setup();
    }

    if (!!this.output) {
      this.output.appendLine(message);
    }
  }

  static log(message: any): void {
    const logLine = `[${this.timestamp}] Chat: ${message}`;
    return process.env.IS_DEBUG === "true"
      ? this.logOnConsole(logLine)
      : this.logOnOutput(logLine);
  }
}
