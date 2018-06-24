const vscode = acquireVsCodeApi();

const SAME_GROUP_TIME = 5 * 60 * 1000; // ms

Vue.component("messages", {
  props: ["messages", "users"],
  computed: {
    messageGroups: function() {
      this.messages.sort(function(a, b) {
        return +b.timestamp - +a.timestamp;
      });
      let groups = [];
      let currentGroup = {};

      this.messages.forEach(message => {
        const isSameUser = currentGroup.userId
          ? message.userId === currentGroup.userId
          : false;
        const isSameTime = currentGroup.timestamp
          ? +currentGroup.timestamp - +message.timestamp < SAME_GROUP_TIME
          : false;

        if (isSameTime && isSameUser) {
          currentGroup.messages = [].concat([message], currentGroup.messages);
          currentGroup.timestamp = message.timestamp;
        } else {
          if (currentGroup.timestamp) {
            groups.push(currentGroup);
          }

          currentGroup = {
            messages: [message],
            userId: message.userId,
            timestamp: message.timestamp
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
        v-bind:user="group.userId"
        v-bind:timestamp="group.timestamp">
      </message-group>
    </div>
  `
});

Vue.component("message-group", {
  props: ["messages", "user", "timestamp"],
  computed: {
    readableTimestamp: function() {
      const d = new Date(+this.timestamp * 1000);
      return d.toLocaleTimeString();
    }
  },
  template: `
    <ul>
      <li>{{ user }}</li>
      <li>{{ readableTimestamp }}</li>

      <message-item
        v-for="message in messages"
        v-bind:key="message.timestamp"
        v-bind:message="message">
      </message-item>
    </ul>
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
      <input v-model="text" placeholder="Message"></input>
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
