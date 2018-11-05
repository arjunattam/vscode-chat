import { Uri, EventEmitter, Event, CancellationToken } from "vscode";
import * as vsls from "vsls/vscode";
import {
  ContactServiceProvider,
  Methods,
  NotifyContactServiceEventArgs,
  InviteRequest,
  ContactPresenceRequest,
  ContactPresenceResponse,
  Contact,
  PresenceStatus,
  ContactsNotification,
  InitializeResponse,
  PresenceChangedNotification,
  InviteReceivedNotification,
  SelfContactNotification
} from "vsls/vsls-contactprotocol";
import { User, Users } from "../types";

export class VslsContactProvider implements ContactServiceProvider {
  private readonly _onNotified = new EventEmitter<
    NotifyContactServiceEventArgs
  >();

  constructor(private description: string) {}

  async register() {
    const liveshare = await vsls.getApiAsync();

    if (!!liveshare) {
      liveshare.registerContactServiceProvider(this.description, this);
    }
  }

  public get onNotified(): Event<NotifyContactServiceEventArgs> {
    return this._onNotified.event;
  }

  public async requestAsync(
    type: string,
    parameters: Object,
    cancellationToken?: CancellationToken
  ): Promise<Object> {
    let result = null;

    switch (type) {
      case Methods.RequestInitializeName:
        // Request for initialization
        result = await this.initializeHandler();
        break;
      case Methods.RequestInviteName:
        // Request for sending invitation link
        await this.sendInviteLinkHandler(<InviteRequest>parameters);
        break;
      case Methods.RequestContactPresenceName:
        // Request for presence query of the user
        result = await this.presenceRequestHandler(<ContactPresenceRequest>(
          parameters
        ));
        break;
      default:
        throw new Error(`type:${type} not supported`);
    }

    return result;
  }

  public notify(type: string, body: any) {
    this._onNotified.fire({
      type,
      body
    });
  }

  private getContact = (user: User) => {
    const isOnline = user.isOnline;
    const contact: Contact = {
      id: user.id,
      displayName: user.fullName,
      email: user.email,
      status: isOnline ? PresenceStatus.Available : PresenceStatus.Offline
    };
    return contact;
  };

  public notifySelfContact(user: User) {
    const contact = this.getContact(user);

    this.notify(Methods.NotifySelfContactName, <SelfContactNotification>{
      contact
    });
  }

  public notifyAvailableUsers(selfUserId: string, users: Users) {
    const contacts = Object.keys(users)
      .filter(key => key !== selfUserId)
      .map(key => this.getContact(users[key]));

    this.notify(Methods.NotifyAvailableUsersName, <ContactsNotification>{
      contacts
    });
  }

  public notifyPresenceChanged(user: User) {
    const contact = this.getContact(user);
    this.notify(Methods.NotifyPresenceChangedName, <
      PresenceChangedNotification
    >{
      changes: [
        {
          contactId: contact.id,
          status: contact.status
        }
      ]
    });
  }

  public notifyInviteReceived(fromUserId: string, uri: Uri) {
    this.notify(Methods.NotifyInviteReceivedName, <InviteReceivedNotification>{
      fromContactId: fromUserId,
      link: uri.toString()
    });
  }

  private async initializeHandler(): Promise<InitializeResponse> {
    return {
      description: this.description,
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

  private async sendInviteLinkHandler(params: InviteRequest): Promise<void> {
    // TODO:
    // await this.webClient.chat.postMessage({
    //   channel: this.imChannels[params.targetContactId],
    //   text: params.link,
    //   as_user: true
    // });
  }

  private async presenceRequestHandler(
    params: ContactPresenceRequest
  ): Promise<ContactPresenceResponse> {
    // TODO:
    console.log("request contacts");
    const { contacts } = params;
    console.log(contacts);

    let result: ContactPresenceResponse = {
      contacts: []
    };

    return result;
  }
}
