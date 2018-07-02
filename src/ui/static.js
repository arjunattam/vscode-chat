const vscode = acquireVsCodeApi();

// Regex from https://stackoverflow.com/a/15855457
const URL_REGEX = /(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?/;
const LINK_FORMAT_REGEX = new RegExp(`<(${URL_REGEX.source})(\\|.+)>`);
const SAME_GROUP_TIME = 5 * 60; // seconds

function hashCode(str) {
  return str
    .split("")
    .reduce(
      (prevHash, currVal) =>
        ((prevHash << 5) - prevHash + currVal.charCodeAt(0)) | 0,
      0
    );
}

Vue.component("app-container", {
  props: ["messages", "users", "channel"],
  template: `
    <div
      class="vue-container"
      v-on:click="clickHandler">

      <messages-section
        v-bind:messages="messages"
        v-bind:users="users">
      </messages-section>

      <form-section
        ref="formSection"
        v-bind:channel="channel">
      </form-section>

    </div>
  `,
  methods: {
    clickHandler: function(event) {
      // When the panel is clicked, we want to focus the input
      const { formSection } = this.$refs;
      return formSection ? formSection.focusInput() : null;
    }
  }
});

Vue.component("messages-section", {
  props: ["messages", "users"],
  computed: {
    messageGroups: function() {
      const messagesCopy = Object.values(this.messages);

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
            messages: [].concat(currentGroup.messages, [message]),
            key: hashCode(`${currentGroup.key}${message.text}`)
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
              minTimestamp: message.timestamp,
              key: hashCode(message.text) // key should change if text changes
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
        v-bind:key="group.key"
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
    borderColor: function() {
      return this.message.color ? `#${this.message.color}` : ``;
    }
  },
  template: `
    <li
      v-bind:class="{ 'bot-border': message.color }"
      v-bind:style="{ borderColor: borderColor }">
      <div class="li-line" v-if="message.attachment">
        <message-attachment
          v-bind:name="message.attachment.name"
          v-bind:permalink="message.attachment.permalink">
        </message-attachment>
      </div>
      <div class="li-line" v-else>
        <message-text v-bind:message="message"></message-text>
      </div>
    </li>
  `
});

Vue.component("message-text", {
  props: ["message"],
  render: function(createElement) {
    const md = mdText =>
      createElement("vue-markdown", { class: { md: true } }, mdText);
    const link = url => createElement("message-link", { props: { to: url } });
    const { text } = this.message;
    const r = new RegExp(`(<${URL_REGEX.source}>)`, "g");
    const elements = text.split(r).map(section => {
      if (section.match(r)) {
        return link(section);
      } else {
        return section ? md(section) : null;
      }
    });
    return createElement("div", elements);
  }
});

Vue.component("message-attachment", {
  props: ["name", "permalink"],
  computed: {
    uncleanLink: function() {
      return `<${this.permalink}>`;
    }
  },
  template: `
    <span>
      uploaded a file: <message-link v-bind:to="uncleanLink" v-bind:title="name"></message-link>
    </span>
  `
});

Vue.component("message-link", {
  props: ["to", "title"],
  computed: {
    parsedLink: function() {
      const matched = this.to.match(LINK_FORMAT_REGEX);

      if (matched) {
        const url = matched[1];
        const title = matched[2].substr(1);
        return { url, title };
      } else {
        return { url: this.to.substr(1, this.to.length - 2) };
      }
    },
    name: function() {
      // Can either specify title props, or bot link format (<link|title>)
      // or we just show the url (cleanLink)
      if (this.title) {
        return this.title;
      }

      const { url, title } = this.parsedLink;

      if (title) {
        return title;
      } else {
        return url;
      }
    }
  },
  methods: {
    openLink: function(event) {
      vscode.postMessage({
        type: "link",
        text: this.parsedLink.url
      });
    }
  },
  template: `
    <a v-on:click.prevent="openLink" v-bind:href="parsedLink.url">{{ name }}</a>
  `
});

Vue.component("form-section", {
  props: ["channel"],
  computed: {
    placeholder: function() {
      return `Message ${this.channel}`;
    }
  },
  watch: {
    text: function(newText, oldText) {
      if (newText && !newText.trim()) {
        // This is a bit of a hack: using the command palette to change
        // the channel triggers a newline character in the textarea. In this
        // case, the keydown event is not triggered, and so we handle it here.
        this.text = "";
      }
      this.resizeInput();
    }
  },
  data: function() {
    return {
      text: ""
    };
  },
  template: `
    <div class="form-section">
      <form
        v-on:submit="onSubmit">
        <textarea
          ref="messageInput"
          v-model="text"
          v-bind:placeholder="placeholder"
          v-on:keydown="onKeydown"
          v-focus
          rows="1">
        </textarea>
        <input type="submit"></input>
      </form>
    </div>
  `,
  methods: {
    onSubmit: function(event) {
      type = this.text.startsWith("/") ? "command" : "text";
      vscode.postMessage({
        type,
        text: this.text
      });
      this.text = "";
    },
    focusInput: function() {
      const { messageInput } = this.$refs;
      return messageInput ? messageInput.focus() : null;
    },
    onKeydown: function(event) {
      // Usability fixes
      // 1. Multiline support: only when shift + enter are pressed
      // 2. Submit on enter (without shift)
      if (event.code === "Enter" && !event.shiftKey) {
        event.preventDefault();

        if (this.text) {
          event.target.form.dispatchEvent(
            new Event("submit", { cancelable: true })
          );
        }
      }
    },
    resizeInput: function() {
      const expectedRows = this.text.split("\n").length;
      const input = this.$refs.messageInput;
      if (input && expectedRows !== input.rows) {
        input.rows = expectedRows;
      }
    }
  },
  mounted() {
    return vscode.postMessage({
      type: "internal",
      text: "is_ready"
    });
  }
});

Vue.directive("focus", {
  // When the bound element is inserted into the DOM...
  inserted: function(el) {
    el.focus();
  }
});

// Markdown
Vue.use(VueMarkdown);
