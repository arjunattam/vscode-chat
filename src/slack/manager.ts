const { WebClient } = require("@slack/client");

interface SlackUser {
  id: string;
  display_name: string;
  image_32: string;
}

interface SlackUsers {
  [id: string]: SlackUser;
}

class SlackManager {
  users: SlackUsers;
  currentUser: SlackUser;
  client;

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

  updateUsers() {
    this.client
      .apiCall("users.list", {})
      .then(response => {
        // TODO(arjun): this needs some pagination
        const { members, ok } = response;

        if (ok) {
          members.forEach(member => {
            this.users[member.id] = {
              id: member.id,
              display_name: member.profile.display_name,
              image_32: member.profile.image_32
            };
          });
        } else {
          console.log("users.list error", response);
        }
      })
      .catch(error => console.error(error));
  }

  updateCurrentUser() {
    // TODO(arjun)
  }
}

export default SlackManager;
