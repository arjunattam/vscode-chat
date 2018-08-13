const vscode = acquireVsCodeApi();

function sendMessage(text, type) {
  vscode.postMessage({
    type,
    text
  });
}

function openLink(href) {
  // Handler for <a> tags in this view
  return sendMessage(href, "link");
}

Vue.component("app-container", {
  props: ["messages", "users", "channel", "status"],
  template: /* html */ `
    <div
      class="vue-container"
      v-on:click="clickHandler">

      <messages-section
        v-bind:messages="messages"
        v-bind:users="users">
      </messages-section>

      <form-section
        ref="formSection"
        v-bind:channel="channel"
        v-bind:status="status">
      </form-section>

    </div>
  `,
  methods: {
    clickHandler: function(event) {
      // When the panel is clicked, we want to focus the input
      // UPDATE, this is disabled: this does not let you select text
      //
      // const { formSection } = this.$refs;
      // return formSection ? formSection.focusInput() : null;
    }
  }
});

Vue.component("messages-section", {
  props: ["messages", "users"],
  template: /* html */ `
    <div class="messages-section">
      <messages-date-group
        v-for="dateGroup in messages"
        v-bind:users="users"
        v-bind:key="dateGroup.date"
        v-bind:groups="dateGroup.groups"
        v-bind:date="dateGroup.date">
      </message-date-group>
    </div>
  `,
  updated() {
    this.$el.scrollTop = this.$el.scrollHeight;
  }
});

Vue.component("messages-date-group", {
  props: ["groups", "users", "date"],
  template: /* html */ `
    <div class="messages-date-section">
      <date-separator v-bind:date="date"></date-separator>
      <message-group
        v-for="group in groups"
        v-bind:key="group.key"
        v-bind:messages="group.messages"
        v-bind:userId="group.userId"
        v-bind:user="group.user"
        v-bind:timestamp="group.minTimestamp">
      </message-group>
    </div>
  `
});

Vue.component("date-separator", {
  props: ["date"],
  computed: {
    dateString: function() {
      const options = { weekday: "long", month: "long", day: "numeric" };
      return new Date(this.date).toLocaleDateString("en-US", options);
    }
  },
  template: /* html */ `
    <h3 class="date-heading">{{dateString}}</h3>
  `
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
  template: /* html */ `
    <div class="message-group">
      <div class="message-group-image">
        <img v-bind:src="user ? user.imageUrl : null"></img>
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
  template: /* html */ `
    <li>
      <div v-if="message.textHTML" v-html="message.textHTML"></div>
      <span v-if="message.isEdited" class="edited">(edited)</span>
      <message-reactions
        v-bind:reactions="message.reactions">
      </message-reactions>
      <message-content
        v-bind:content="message.content">
      </message-content>
    </li>
  `
});

Vue.component("message-reactions", {
  props: ["reactions"],
  template: /* html */ `
    <ul class="message-reactions">
      <message-reaction v-for="reaction in reactions"
        v-bind:emoji="reaction.name"
        v-bind:count="reaction.count"
        v-bind:users="reaction.userIds"
        v-bind:key="reaction.name">
      </message-reaction>
    </ul>
  `
});

Vue.component("message-reaction", {
  // TODO: add hover behaviour to show users
  props: ["emoji", "count", "users"],
  template: /* html */ `
    <li>
      <div>{{emoji}}</div>
      <div>{{count}}</div>
    </li>
  `
});

Vue.component("message-content", {
  // This renders the attachment portion of the Slack message
  props: ["content"],
  computed: {
    borderColor: function() {
      const { borderColor } = this.content;
      const defaultColor = `var(--vscode-scrollbarSlider-activeBackground)`;
      return borderColor ? `#${borderColor}` : defaultColor;
    }
  },
  template: /* html */ `
    <div class="li-line" v-bind:style="{ borderColor: borderColor }">
      <div v-if="content.pretext">{{ content.pretext }} </div>
      <message-author v-if="content.author" v-bind:content="content"></message-author>
      <message-title v-if="content.title" v-bind:content="content"></message-title>
      <div v-if="content.textHTML" v-html="content.textHTML"></div>
      <div
        class="msg-footer" v-if="content.footerHTML"
        v-html="content.footerHTML">
      </div>
    </div>
  `
});

Vue.component("message-author", {
  props: ["content"],
  template: /* html */ `
    <div class="msg-author">
      <img v-bind:src="content.authorIcon"></img>
      <span>{{ content.author }}</span>
    </div>
  `
});

Vue.component("message-title", {
  props: ["content"],
  computed: {
    titleOnclick: function() {
      return `openLink('${this.content.titleLink}'); return false;`;
    }
  },
  template: /* html */ `
    <div class="msg-title">
      <a v-bind:href="content.titleLink" v-bind:onclick="titleOnclick">
        {{ content.title }}
      </a>
    </div>
  `
});

Vue.component("form-section", {
  props: ["channel", "status"],
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
  template: /* html */ `
    <div class="form-section">
      <form
        v-on:submit="onSubmit">
        <textarea
          ref="messageInput"
          v-model="text"
          v-bind:placeholder="placeholder"
          v-on:keydown="onKeydown"
          v-on:focus="onFocus"
          v-focus
          rows="1">
        </textarea>
        <input type="submit"></input>
      </form>
      <status-text v-bind:status="status"></status-text>
    </div>
  `,
  methods: {
    onSubmit: function(event) {
      type = this.text.startsWith("/") ? "command" : "text";
      sendMessage(this.text, type);
      this.text = "";
    },
    onFocus: function(event) {
      return sendMessage("is_focused", "internal");
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
    return sendMessage("is_ready", "internal");
  }
});

Vue.component("status-text", {
  props: ["status"],
  template: /* html */ `
    <div class="status-text">{{ status }}</div>
  `
});

Vue.directive("focus", {
  // When the bound element is inserted into the DOM...
  inserted: function(el) {
    el.focus();
  }
});
