import * as vscode from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import { EXTENSION_ID } from "./constants";

export default class Reporter {
  private reporter: TelemetryReporter;

  constructor() {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    const extensionVersion = extension.packageJSON.version;

    // TODO
    const key = "";

    this.reporter = new TelemetryReporter(EXTENSION_ID, extensionVersion, key);
  }

  dispose() {
    this.reporter.dispose();
  }

  sendEvent() {
    this.reporter.sendTelemetryEvent(
      "sampleEvent",
      { stringProp: "some string" },
      { numericMeasure: 123 }
    );
  }
}
