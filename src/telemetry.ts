import * as vscode from "vscode";
import * as Mixpanel from "mixpanel";
import { MIXPANEL_TOKEN, VSLS_EXTENSION_PACK_ID } from "./constants";
import ConfigHelper from "./config";
import { TelemetryEvent, IStore, EventType, EventSource } from "./interfaces";
import { getVersions, Versions, getExtension } from "./utils";

const BATCH_SIZE = 10;

export default class Reporter implements vscode.Disposable {
  private hasUserOptIn: boolean = false;
  private uniqueId: string;
  private mixpanel: Mixpanel.Mixpanel;
  private versions: Versions;
  private hasExtensionPack: boolean;
  private pendingEvents: TelemetryEvent[] = [];

  constructor(private store: IStore) {
    this.uniqueId = this.store.installationId;
    this.versions = getVersions();

    if (process.env.IS_DEBUG !== "true") {
      this.hasUserOptIn = ConfigHelper.hasTelemetry();
    }

    if (this.hasUserOptIn) {
      this.mixpanel = Mixpanel.init(MIXPANEL_TOKEN);
    }

    this.hasExtensionPack = !!getExtension(VSLS_EXTENSION_PACK_ID);
  }

  setUniqueId(uniqueId: string) {
    this.uniqueId = uniqueId;
  }

  dispose(): Promise<any> {
    if (this.pendingEvents.length > 0) {
      return this.flushBatch();
    }
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

    const event: TelemetryEvent = {
      type: name,
      time: new Date(),
      properties: {
        source: source,
        channel_type: channelType
      }
    };

    if (this.hasUserOptIn) {
      this.pendingEvents.push(event);

      if (this.pendingEvents.length >= BATCH_SIZE) {
        this.flushBatch();
      }
    }
  }

  getMxEvent(event: TelemetryEvent): Mixpanel.Event {
    const { os, extension, editor } = this.versions;
    const { type: name, properties, time } = event;
    return {
      event: name,
      properties: {
        distinct_id: this.uniqueId,
        // TODO: move versions to user properties?
        extension_version: extension,
        os_version: os,
        editor_version: editor,
        has_extension_pack: this.hasExtensionPack,
        ...properties,
        time
      }
    };
  }

  flushBatch(): Promise<any> {
    const copy = [...this.pendingEvents];
    const events = copy.map(event => this.getMxEvent(event));
    this.pendingEvents = [];

    return new Promise((resolve, reject) => {
      this.mixpanel.track_batch(events, error => {
        if (!error) {
          resolve();
        } else {
          // We are not going to retry with `copy`
          reject();
        }
      });
    });
  }
}
