import * as vscode from "vscode";
import {
  RTMClient,
  RTMClientOptions,
  WebClient,
  WebClientOptions
} from "@slack/client";
import * as contactProtocol from "vsls/vsls-contactprotocol";
import { Uri } from "vscode";

const RTMEvents = {
  AUTHENTICATED: "authenticated",
  MESSAGE: "message",
  ERROR: "unable_to_rtm_start",
  REACTION_ADDED: "reaction_added",
  REACTION_REMOVED: "reaction_removed",
  PRESENCE_CHANGE: "presence_change",
  CHANNEL_MARKED: "channel_marked",
  GROUP_MARKED: "group_marked",
  IM_MARKED: "im_marked"
};

const EventSubTypes = {
  EDITED: "message_changed",
  DELETED: "message_deleted",
  REPLIED: "message_replied"
};

export class SlackClientProvider
  implements contactProtocol.ContactServiceProvider {
  private webClient: WebClient;
  private rtmClient: RTMClient;
  private readonly users: { [key: string]: contactProtocol.Contact } = {};
  private readonly imChannels = {};
  private selfUserId: string;
  private readonly _onNotified = new vscode.EventEmitter<
    contactProtocol.NotifyContactServiceEventArgs
  >();

  constructor(token: string) {
    this.createWebClient(token);
  }

  public get onNotified(): vscode.Event<
    contactProtocol.NotifyContactServiceEventArgs
  > {
    return this._onNotified.event;
  }

  public async requestAsync(
    type: string,
    parameters: Object,
    cancellationToken?: vscode.CancellationToken
  ): Promise<Object> {
    let result = null;

    switch (type) {
      case contactProtocol.Methods.RequestInitializeName:
        result = await this.initializeHandler();
        break;
      case contactProtocol.Methods.RequestInviteName:
        await this.sendInviteLinkHandler(<contactProtocol.InviteRequest>(
          parameters
        ));
        break;
      default:
        throw new Error(`type:${type} not supported`);
    }

    return result;
  }

  public async changeToken(token: string): Promise<void> {
    this.createWebClient(token);
    await this.initializeClient();
  }

  public notify(type: string, body: any) {
    if (type === "presenceChanged") {
      const change = body.changes[0];
      console.log(change.contactId, change.status);
      console.log(this.users[change.contactId].displayName);
    } else {
      console.log("type", type);
    }

    this._onNotified.fire({
      type,
      body
    });
  }

  private createWebClient(token: string): void {
    const webOptions: WebClientOptions = { retryConfig: { retries: 1 } };
    this.webClient = new WebClient(token, webOptions);
    let options: RTMClientOptions = {};
    this.rtmClient = new RTMClient(token, options);

    this.rtmClient.on(RTMEvents.MESSAGE, event => this.handleMessage(event));
    this.rtmClient.on(RTMEvents.PRESENCE_CHANGE, event => {
      if (event.user === "U8A2KNWLC") {
        //
        console.log(event);
      }

      let status: contactProtocol.PresenceStatus;
      switch (event.presence) {
        case "active":
          status = contactProtocol.PresenceStatus.Available;
          break;
        case "away":
          status = contactProtocol.PresenceStatus.Away;
          break;
        default:
          status = contactProtocol.PresenceStatus.Offline;
          break;
      }

      this.notify(contactProtocol.Methods.NotifyPresenceChangedName, <
        contactProtocol.PresenceChangedNotification
      >{
        changes: [
          {
            // contactId:
            //   status === contactProtocol.PresenceStatus.Available
            //     ? "arjunattam@gmail.com"
            //     : event.user,
            contactId: event.user,
            status
          }
        ]
      });
    });
  }

  private async initializeClient(): Promise<void> {
    (await this.fetchContacts()).forEach(c => (this.users[c.id] = c));
    await this.fetchIMChannles();
    await this.start();
    await this.rtmClient.subscribePresence(Object.keys(this.users));

    this.notify(contactProtocol.Methods.NotifySelfContactName, <
      contactProtocol.SelfContactNotification
    >{
      contact: this.users[this.selfUserId]
    });

    this.notify(contactProtocol.Methods.NotifyAvailableUsersName, <
      contactProtocol.ContactsNotification
    >{
      contacts: Object.keys(this.users)
        .filter(key => key !== this.selfUserId)
        .map(key => this.users[key])
    });
  }

  private async initializeHandler(): Promise<
    contactProtocol.InitializeResponse
  > {
    await this.initializeClient();
    return {
      description: "Slack",
      capabilities: {
        supportsDispose: false,
        supportsInviteLink: true,
        supportsPresence: true,
        supportsContactPresenceRequest: true,
        supportsPublishPresence: false,
        supportsSelfContact: true,
        supportsAvailableContacts: true
      }
    };
  }

  private async sendInviteLinkHandler(
    params: contactProtocol.InviteRequest
  ): Promise<void> {
    await this.webClient.chat.postMessage({
      channel: this.imChannels[params.targetContactId],
      text: params.link,
      as_user: true
    });
  }

  private fetchIMChannles(): Promise<void> {
    return this.webClient.conversations
      .list({ types: "im" })
      .then((response: any) => {
        const { channels, ok } = response;

        if (ok) {
          channels.forEach(
            channel => (this.imChannels[channel.user] = channel.id)
          );
        }
      });
  }

  private userId = (m: any) => {
    // if (m.real_name === "Arjun Attam") {
    //   return "arjunattam@gmail.com";
    // }
    return m.id;
  };

  private fetchContacts(): Promise<contactProtocol.Contact[]> {
    return this.webClient.users.list({}).then((response: any) => {
      const { members, ok } = response;

      if (ok) {
        return members.map(
          m =>
            <contactProtocol.Contact>{
              id: this.userId(m),
              displayName: m.real_name,
              email: m.profile.email
            }
        );
      }

      return [];
    });
  }

  private start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.rtmClient.once(RTMEvents.AUTHENTICATED, response => {
        const { ok, self } = response;
        if (ok) {
          console.log(self.id);
          this.selfUserId = self.id;
          // this.selfUserId = "arjunattam@gmail.com";
          // U8A2KNWLC
          return resolve();
        }
      });

      this.rtmClient.once(RTMEvents.ERROR, error => {
        return reject(error);
      });

      // Note, rtm.start is heavily rate-limited
      this.rtmClient.start();
    });
  }

  private handleMessage(event: any) {
    const { subtype } = event;

    switch (subtype) {
      case EventSubTypes.DELETED:
        break;

      case EventSubTypes.EDITED:
        break;

      case EventSubTypes.REPLIED:
        break;

      default:
        const { text, attachments, files, user } = event;
        const hasAttachment = attachments && attachments.length > 0;
        const hasFiles = files && files.length > 0;

        if (user !== this.selfUserId && (!!text || hasAttachment || hasFiles)) {
          try {
            let uriText = <string>text;
            if (uriText.startsWith("<") && uriText.endsWith(">")) {
              uriText = uriText.substring(1, uriText.length - 1); // Strip link symbols
            }

            const uri = Uri.parse(uriText);
            if (uri.authority.indexOf("liveshare") > 0) {
              this.notify(contactProtocol.Methods.NotifyInviteReceivedName, <
                contactProtocol.InviteReceivedNotification
              >{
                fromContactId: <string>user,
                link: uri.toString()
              });
            }
          } catch {
            // Uri parse error means the message does not contain a valid Uri
          }
        }
    }
  }
}
