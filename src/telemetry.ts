import * as vscode from "vscode";
// import * as amplitude from "amplitude-js";
// import TelemetryReporter from "vscode-extension-telemetry";
import { EXTENSION_ID } from "./constants";
import ConfigHelper from "./config";

export default class Reporter implements vscode.Disposable {
  private hasUserOptIn: boolean = false;
  // private reporter: TelemetryReporter;
  static shared: Reporter;

  constructor(uniqueId: string) {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    const extensionVersion = extension.packageJSON.version;

    if (process.env.IS_DEBUG !== "true") {
      this.hasUserOptIn = ConfigHelper.hasTelemetry();
    }

    // this.reporter = new TelemetryReporter(
    //   EXTENSION_ID,
    //   extensionVersion,
    //   APP_INSIGHTS_KEY
    // );
  }

  dispose() {
    // return this.reporter.dispose();
  }

  sendEvent(eventName: string) {
    // return this.reporter.sendTelemetryEvent(eventName);
  }
}
