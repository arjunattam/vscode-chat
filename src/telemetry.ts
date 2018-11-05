import * as vscode from "vscode";
import * as Mixpanel from "mixpanel";
import { MIXPANEL_TOKEN } from "./constants";
import ConfigHelper from "./config";
import Manager from "./manager";
import { TelemetryEvent, EventType, EventSource } from "./types";
import { getVersions, Versions, hasVslsExtensionPack } from "./utils";

const BATCH_SIZE = 10;
const INTERVAL_TIMEOUT = 30 * 60 * 1000; // 30 mins in ms

export default class TelemetryReporter implements vscode.Disposable {
  private hasUserOptIn: boolean = false;
  private uniqueId: string;
  private mixpanel: Mixpanel.Mixpanel | undefined;
  private versions: Versions;
  private hasExtensionPack: boolean;
  private pendingEvents: TelemetryEvent[] = [];
  private interval: NodeJS.Timer | undefined;

  constructor(private manager: Manager) {
    const { installationId } = this.manager.store;
    this.uniqueId = installationId;
    this.versions = getVersions();

    if (process.env.IS_DEBUG !== "true") {
      this.hasUserOptIn = ConfigHelper.hasTelemetry();
    }

    if (this.hasUserOptIn) {
      this.mixpanel = Mixpanel.init(MIXPANEL_TOKEN);

      this.interval = setInterval(() => {
        if (this.pendingEvents.length > 0) {
          return this.flushBatch();
        }
      }, INTERVAL_TIMEOUT);
    }

    this.hasExtensionPack = hasVslsExtensionPack();
  }

  setUniqueId(uniqueId: string) {
    this.uniqueId = uniqueId;
  }

  dispose(): Promise<any> {
    if (!!this.interval) {
      clearInterval(this.interval);
    }

    if (this.pendingEvents.length > 0) {
      return this.flushBatch();
    }

    return Promise.resolve();
  }

  record(
    name: EventType,
    source: EventSource | undefined,
    channelId: string | undefined
  ) {
    let channelType = undefined;

    if (!!channelId) {
      const channel = this.manager.getChannel(channelId);
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
        extension_version: extension,
        os_version: os,
        editor_version: editor,
        has_extension_pack: this.hasExtensionPack,
        is_authenticated: this.manager.isAuthenticated(),
        provider: this.manager.getSelectedProvider(),
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
      if (!this.mixpanel) {
        resolve();
      } else {
        this.mixpanel.track_batch(events, error => {
          if (!error) {
            resolve();
          } else {
            // We are not going to retry with `copy`
            reject();
          }
        });
      }
    });
  }
}
