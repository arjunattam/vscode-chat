import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import { EXTENSION_ID, APP_INSIGHTS_KEY } from "./constants";

export default class Reporter {
  private reporter: TelemetryReporter;

  constructor() {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    const extensionVersion = extension.packageJSON.version;
    this.reporter = new TelemetryReporter(
      EXTENSION_ID,
      extensionVersion,
      APP_INSIGHTS_KEY
    );
  }

  dispose() {
    return this.reporter.dispose();
  }

  sendOpenSlackEvent() {
    return this.sendEvent("openSlack");
  }

  sendChangeChannelEvent() {
    return this.sendEvent("changeChannel");
  }

  sendEvent(eventName: string) {
    // Can add props to events
    // https://github.com/Microsoft/vscode-extension-telemetry
    if (process.env.IS_DEBUG === "true") {
      // Telemetry disabled for debugging
      return;
    }

    return this.reporter.sendTelemetryEvent(eventName);
  }
}
