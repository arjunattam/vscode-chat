import * as vscode from "vscode";
import * as Mixpanel from "mixpanel";
import { MIXPANEL_TOKEN } from "./constants";
import ConfigHelper from "./config";
import { TelemetryEvent, IStore, EventType, EventSource } from "./interfaces";
import { getVersions, Versions } from "./utils";

export default class Reporter implements vscode.Disposable {
  private hasUserOptIn: boolean = false;
  private uniqueId: string;
  private mixpanel: Mixpanel.Mixpanel;
  private versions: Versions;

  constructor(private store: IStore) {
    this.uniqueId = this.store.installationId;
    this.versions = getVersions();

    // TODO: remove these comments after testing
    // if (process.env.IS_DEBUG !== "true") {
    this.hasUserOptIn = ConfigHelper.hasTelemetry();
    // }

    if (this.hasUserOptIn) {
      this.mixpanel = Mixpanel.init(MIXPANEL_TOKEN);
    }
  }

  dispose() {
    // TODO: clear pending events here (return Promise<any>)
  }

  record(
    name: EventType,
    source: EventSource | undefined,
    channelId: string | undefined
  ) {
    let channelType = undefined;

    if (!!channelId) {
      const channel = this.store.getChannel(channelId);
      channelType = !!channel ? channel.type : undefined;
    }

    return this.sendEvent({
      type: name,
      time: new Date(),
      properties: {
        source: source,
        channel_type: channelType
      }
    });
  }

  sendEvent(event: TelemetryEvent): Promise<any> {
    if (!!this.mixpanel) {
      const { os, extension, editor } = this.versions;
      const { type: name, properties, time } = event;

      return new Promise((resolve, reject) => {
        this.mixpanel.track(
          name,
          {
            distinct_id: this.uniqueId,
            // TODO: move versions to user properties?
            extension_version: extension,
            os_version: os,
            editor_version: editor,
            ...properties,
            time
          },
          error => {
            if (!error) {
              resolve();
            } else {
              reject(error);
            }
          }
        );
      });
    }
  }
}
