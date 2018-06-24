const vscode = acquireVsCodeApi();

const SAME_GROUP_TIME = 5 * 60; // ms

Vue.component("app-container", {
  props: ["messages", "users"],
  template: `
    <div
      class="vue-container">
      <messages
        v-bind:messages="messages"
        v-bind:users="users">
      </messages>

      <form-section></form-section>
    </div>
  `
});

Vue.component("messages", {
  props: ["messages", "users"],
  computed: {
    messageGroups: function() {
      this.messages.sort(function(a, b) {
        return +a.timestamp - +b.timestamp;
      });
      let groups = [];
      let currentGroup = {};

      this.messages.forEach(message => {
        const isSameUser = currentGroup.userId
          ? message.userId === currentGroup.userId
          : false;
        const isSameTime = currentGroup.timestamp
          ? +message.timestamp - +currentGroup.timestamp < SAME_GROUP_TIME
          : false;

        if (isSameTime && isSameUser) {
          currentGroup.messages = [].concat(currentGroup.messages, [message]);
          currentGroup.timestamp = message.timestamp;
        } else {
          if (currentGroup.timestamp) {
            groups.push(currentGroup);
          }

          currentGroup = {
            messages: [message],
            userId: message.userId,
            user: this.users[message.userId],
            timestamp: message.timestamp,
            minTimestamp: message.timestamp
          };
        }
      });

      if (currentGroup.timestamp) {
        groups.push(currentGroup);
      }

      return groups;
    }
  },
  template: `
    <div class="messages-section">
      <message-group
        v-for="group in messageGroups"
        v-bind:key="group.timestamp"
        v-bind:messages="group.messages"
        v-bind:userId="group.userId"
        v-bind:user="group.user"
        v-bind:timestamp="group.minTimestamp">
      </message-group>
    </div>
  `,
  updated() {
    this.$el.scrollTop = this.$el.scrollHeight;
  }
});

Vue.component("message-group", {
  props: ["messages", "userId", "user", "timestamp"],
  computed: {
    readableTimestamp: function() {
      const d = new Date(+this.timestamp * 1000);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    },
    userName: function() {
      return this.user ? this.user.name : this.userId;
    }
  },
  template: `
    <div class="message-group">
      <img
        v-bind:src="user ? user.imageUrl : null">
      </img>
      <div>
        <div>
          <strong>{{ userName }}</strong>
          <span>{{ readableTimestamp }}</span>
        </div>

        <ul class="message-list">
          <message-item
            v-for="message in messages"
            v-bind:key="message.timestamp"
            v-bind:message="message">
          </message-item>
        </ul>
      </div>
    </div>
  `
});

Vue.component("message-item", {
  props: ["message"],
  template: `
    <li>
      {{ message.text }}
    </li>
  `
});

Vue.component("form-section", {
  template: `
    <div class="form-section">
      <message-form></message-form>
    </div>
  `
});

Vue.component("message-form", {
  data: function() {
    return {
      text: ""
    };
  },
  template: `
    <form
      v-on:submit="onSubmit">
      <input
        v-model="text"
        v-focus
        placeholder="Message">
      </input>
      <input type="submit"></input>
    </form>
  `,
  methods: {
    onSubmit: function(event) {
      vscode.postMessage({
        command: "send",
        text: this.text
      });
      this.text = "";
    }
  }
});

Vue.directive("focus", {
  // When the bound element is inserted into the DOM...
  inserted: function(el) {
    el.focus();
  }
});
