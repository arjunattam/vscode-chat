// const { WebClient } = require("@slack/client");
import { WebClient } from "@slack/client";
import { SlackUser, SlackUsers } from "./interfaces";

class SlackManager {
  users: SlackUsers;
  currentUser: SlackUser;
  client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
    this.users = {};
    this.updateCurrentUser();
  }

  getUserInfo(userId: string) {
    if (userId in this.users) {
      return this.users[userId];
    } else {
      this.updateUsers();
    }
  }

  getConversationHistory(channel: string) {
    return this.client
      .apiCall("conversations.history", { channel, limit: 20 })
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

  updateUsers() {
    this.client.apiCall("users.list", {}).then((response: any) => {
      // TODO(arjun): this needs some pagination
      const { members, ok } = response;

      if (ok) {
        members.forEach(member => {
          this.users[member.id] = {
            id: member.id,
            displayName: member.profile.display_name,
            imageUrl: member.profile.image_32
          };
        });
      }
    });
  }

  updateCurrentUser() {
    // TODO(arjun)
  }
}

export default SlackManager;
