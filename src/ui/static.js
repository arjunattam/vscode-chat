const vscode = acquireVsCodeApi();

const SAME_GROUP_TIME = 5 * 60; // ms

function isValidUrl(value) {
  // https://stackoverflow.com/a/15855457
  return /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(
    value
  );
}

Vue.component("app-container", {
  props: ["messages", "users"],
  template: `
    <div class="vue-container">
      <messages-section
        v-bind:messages="messages"
        v-bind:users="users">
      </messages-section>

      <form-section></form-section>
    </div>
  `
});

Vue.component("messages-section", {
  props: ["messages", "users"],
  computed: {
    messageGroups: function() {
      const messagesCopy = this.messages.slice();

      messagesCopy.sort(function(a, b) {
        return +a.timestamp - +b.timestamp;
      });

      const initialValue = {
        currentGroup: {},
        groups: []
      };

      let result = messagesCopy.reduce((groupsAccumulator, message) => {
        const { currentGroup, groups } = groupsAccumulator;

        const isSameUser = currentGroup.userId
          ? message.userId === currentGroup.userId
          : false;
        const isSameTime = currentGroup.timestamp
          ? +message.timestamp - +currentGroup.timestamp < SAME_GROUP_TIME
          : false;

        if (isSameTime && isSameUser) {
          let newGroup = Object.assign(currentGroup, {
            timestamp: message.timestamp,
            messages: [].concat(currentGroup.messages, [message])
          });
          groupsAccumulator = {
            currentGroup: newGroup,
            groups: groups
          };
        } else {
          groupsAccumulator = {
            currentGroup: {
              messages: [message],
              userId: message.userId,
              user: this.users[message.userId],
              timestamp: message.timestamp,
              minTimestamp: message.timestamp
            },
            groups: currentGroup.timestamp
              ? [].concat(groups, [currentGroup])
              : groups
          };
        }
        return groupsAccumulator;
      }, initialValue);

      const { currentGroup, groups } = result;
      return currentGroup.timestamp
        ? [].concat(groups, [currentGroup])
        : groups;
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
      <div class="message-group-image">
        <img
          v-bind:src="user ? user.imageUrl : null">
        </img>
      </div>
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
  computed: {
    isURL: function() {
      const { text } = this.message;
      const link = text.substr(1, text.length - 2);
      return text.startsWith("<") && text.endsWith(">") && isValidUrl(link);
    },
    toLink: function() {
      const { text } = this.message;
      return text.substr(1, text.length - 2);
    }
  },
  template: `
    <li>
      <message-link v-if="isURL" v-bind:to="toLink"></message-link>
      <span v-else>{{ message.text }}</span>
    </li>
  `
});

Vue.component("message-link", {
  props: ["to"],
  methods: {
    openLink: function(event) {
      vscode.postMessage({
        type: "link",
        text: this.to
      });
    }
  },
  template: `
    <a v-on:click.prevent="openLink" v-bind:href="to">
      {{ to }}
    </a>
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
      type = this.text.startsWith("/") ? "command" : "text";
      vscode.postMessage({
        type,
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
