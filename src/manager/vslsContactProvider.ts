import * as vscode from "vscode";
import { Uri, EventEmitter, Event, CancellationToken } from "vscode";
import * as vsls from "vsls/vscode";
import { SelfCommands } from "../constants";
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
  SelfContactNotification,
  PublishPresenceRequest
} from "vsls/vsls-contactprotocol";
import Manager from "./index";

export class VslsContactProvider implements ContactServiceProvider {
  public isInitialized: boolean = false;
  private matchedContacts: { [internalUserId: string]: Contact } = {};

  private readonly _onNotified = new EventEmitter<
    NotifyContactServiceEventArgs
  >();

  constructor(public presenceProviderName: string, private manager: Manager) {}

  async register() {
    const liveshare = await vsls.getApiAsync();

    if (!!liveshare) {
      liveshare.registerContactServiceProvider(this.presenceProviderName, this);
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
    let result = {};

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
      case Methods.RequestPublishPresenceName:
        await this.publishPresenceHandler(<PublishPresenceRequest>parameters);
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
    const notification: PresenceChangedNotification = {
      changes: [
        {
          contactId: contact.id,
          status: <PresenceStatus>contact.status
        }
      ]
    };
    this.notify(Methods.NotifyPresenceChangedName, notification);

    // This user might also have a matched contact, and if so,
    // we will send a presence changed notification for them.
    const matchedContact = this.matchedContacts[user.id];

    if (!!matchedContact) {
      const notification: PresenceChangedNotification = {
        changes: [
          {
            contactId: matchedContact.id,
            status: <PresenceStatus>contact.status
          }
        ]
      };
      this.notify(Methods.NotifyPresenceChangedName, notification);
    }
  }

  public notifyInviteReceived(fromUserId: string, uri: Uri) {
    this.notify(Methods.NotifyInviteReceivedName, <InviteReceivedNotification>{
      fromContactId: fromUserId,
      link: uri.toString()
    });
  }

  public getMatchedUserId(contactId: string) {
    const userIds = Object.keys(this.matchedContacts);
    return userIds.find(
      userId => this.matchedContacts[userId].id === contactId
    );
  }

  private async initializeHandler(): Promise<InitializeResponse> {
    this.isInitialized = true;
    return {
      description: this.presenceProviderName,
      capabilities: {
        supportsDispose: false,
        supportsInviteLink: true,
        supportsPresence: true,
        supportsContactPresenceRequest: true,
        supportsPublishPresence: true,
        supportsSelfContact: true,
        supportsAvailableContacts: true
      }
    };
  }

  private async sendInviteLinkHandler(params: InviteRequest): Promise<void> {
    const { link, targetContactId } = params;
    // targetContactId can be one of slack/discord users, or
    // a matched contact.
    const matchedUserIds = Object.keys(this.matchedContacts);
    const targetMatchedUserId = matchedUserIds.find(
      userId => this.matchedContacts[userId].id === targetContactId
    );
    const userIdToInvite = targetMatchedUserId || targetContactId;
    const userToInvite = this.manager.store.users[userIdToInvite];

    if (!!userToInvite) {
      let imChannel = this.manager.getIMChannel(userToInvite);

      if (!imChannel) {
        imChannel = await this.manager.createIMChannel(
          this.presenceProviderName,
          userToInvite
        );
      }

      if (!!imChannel) {
        this.manager.sendMessage(
          this.presenceProviderName,
          link,
          imChannel.id,
          undefined
        );
      }
    }
  }

  private async presenceRequestHandler(
    params: ContactPresenceRequest
  ): Promise<ContactPresenceResponse> {
    const { contacts } = params;
    const knownUsers = this.manager.store.users;
    const knownUserIds = Object.keys(knownUsers);
    // The response can only have contacts matched in this
    // request. Hence, we maintain a list of matched ids.
    let matchedUserIds: string[] = [];

    // Attempting to match contacts with known users
    contacts.forEach(contact => {
      const { email, displayName } = contact;
      const matchByEmail = knownUserIds.find(
        userId => knownUsers[userId].email === email
      );
      const matchByName = knownUserIds.find(
        // Since discord does not have a full name, we will
        // need to do something else here.
        userId => knownUsers[userId].fullName === displayName
      );
      const matchedUserId = matchByEmail || matchByName;

      if (!!matchedUserId) {
        this.matchedContacts[matchedUserId] = contact;
        matchedUserIds.push(matchedUserId);
      }
    });

    let result: ContactPresenceResponse = {
      contacts: matchedUserIds.map(userId => {
        const contact = this.matchedContacts[userId];
        const user = knownUsers[userId];
        return {
          contactId: contact.id,
          contact: {
            ...contact,
            status: this.getUserPresence(user)
          }
        };
      })
    };
    return result;
  }

  private publishPresenceHandler = async (params: PublishPresenceRequest) => {
    const { status } = params;
    let presence: UserPresence = UserPresence.unknown;

    switch (status) {
      case PresenceStatus.Available:
        presence = UserPresence.available;
        break;
      case PresenceStatus.Away:
        presence = UserPresence.invisible; // This could be `idle` as well
        break;
      case PresenceStatus.Busy:
        presence = UserPresence.doNotDisturb;
        break;
      case PresenceStatus.DoNotDisturb:
        presence = UserPresence.doNotDisturb;
        break;
      case PresenceStatus.Invisible:
        presence = UserPresence.invisible;
        break;
      case PresenceStatus.Offline:
        presence = UserPresence.offline;
        break;
      case PresenceStatus.Unknown:
        presence = UserPresence.unknown;
        break;
    }

    vscode.commands.executeCommand(SelfCommands.UPDATE_SELF_PRESENCE_VIA_VSLS, {
      presence,
      provider: this.presenceProviderName
    });
  };

  private getUserPresence = (user: User): PresenceStatus => {
    switch (user.presence) {
      case UserPresence.available:
        return PresenceStatus.Available;
      case UserPresence.doNotDisturb:
        return PresenceStatus.DoNotDisturb;
      case UserPresence.idle:
        return PresenceStatus.Away;
      case UserPresence.invisible:
        return PresenceStatus.Invisible;
      case UserPresence.offline:
        return PresenceStatus.Offline;
      case UserPresence.unknown:
        return PresenceStatus.Unknown;
    }
  };

  private getContact = (user: User) => {
    const contact: Contact = {
      id: user.id,
      displayName: user.fullName,
      email: user.email,
      status: this.getUserPresence(user)
    };
    return contact;
  };
}
