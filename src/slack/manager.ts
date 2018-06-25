import { WebClient } from "@slack/client";
import { SlackUsers, SlackChannel, SlackCurrentUser } from "./interfaces";

class SlackManager {
  users: SlackUsers;
  channels: SlackChannel[];
  currentUser: SlackCurrentUser;
  client: WebClient;

  constructor(public token: string) {
    this.client = new WebClient(token);
    this.users = {};
  }

  init() {
    this.getCurrentUser();
    return this.getAllUserInfo().then(() => this.getChannels());
  }

  getConversationHistory(channel: string) {
    return this.client
      .apiCall("conversations.history", { channel, limit: 50 })
      .then((response: any) => {
        const { messages, ok } = response;

        if (ok) {
          return messages.map(message => ({
            userId: message.user,
            timestamp: message.ts,
            text: message.text
          }));
        }
      });
  }

  getAllUserInfo() {
    return this.client.apiCall("users.list", {}).then((response: any) => {
      // TODO(arjun): this needs some pagination
      const { members, ok } = response;

      if (ok) {
        members.forEach(member => {
          this.users[member.id] = {
            id: member.id,
            name: member.name,
            imageUrl: member.profile.image_72
          };
        });
      }
    });
  }

  getCurrentUser() {
    this.client
      .apiCall("auth.test", {})
      .then((response: any) => {
        const { ok, user_id } = response;
        if (ok) {
          this.currentUser = { id: user_id, token: this.token };
        }
      })
      .catch(error => console.error(error));
  }

  getChannels() {
    const channels = this.client
      .apiCall("channels.list", { exclude_archived: true })
      .then((response: any) => {
        const { ok, channels } = response;
        if (ok) {
          return channels.map(channel => ({
            id: channel.id,
            name: channel.name,
            type: "channel"
          }));
        }
      });
    const groups = this.client
      .apiCall("groups.list", { exclude_archived: true })
      .then((response: any) => {
        const { ok, groups } = response;
        if (ok) {
          // TODO(arjun): Handle is_mpim case, for private groups
          return groups.map(group => ({
            id: group.id,
            name: group.name,
            type: "group"
          }));
        }
      });
    const directs = this.client.apiCall("im.list", {}).then((response: any) => {
      const { ok, ims } = response;
      if (ok) {
        return ims.map(im => ({
          id: im.id,
          name: this.users[im.user].name,
          type: "im"
        }));
      }
    });
    return Promise.all([channels, groups, directs]).then(
      (values: SlackChannel[][]) => (this.channels = [].concat(...values))
    );
  }
}

export default SlackManager;
