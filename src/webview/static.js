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

function formattedTime(ts) {
  const d = new Date(+ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

Vue.component("app-container", {
  props: ["messages", "users", "channel", "status"],
  template: /* html */ `
    <div class="vue-container">
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
  `
});

Vue.component("messages-section", {
  props: ["messages", "users"],
  data: function() {
    return {
      messagesLength: 0
    };
  },
  template: /* html */ `
    <div class="messages-section">
      <messages-date-group
        v-for="dateGroup in messages"
        v-bind:users="users"
        v-bind:key="dateGroup.date"
        v-bind:groups="dateGroup.groups"
        v-bind:date="dateGroup.date">
      </messages-date-group>
    </div>
  `,
  updated() {
    const groups = this.messages.map(dateGroup => dateGroup.groups);
    const flattened = [].concat.apply([], groups);
    const newLength = flattened.reduce((acc, currentGroup) => {
      return acc + currentGroup.messages.length;
    }, 0);

    if (newLength !== this.messagesLength) {
      this.messagesLength = newLength;
      this.$el.scrollTop = this.$el.scrollHeight;
    }
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
        v-bind:allUsers="users"
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
  props: ["messages", "allUsers", "userId", "user", "timestamp"],
  computed: {
    readableTimestamp: function() {
      return formattedTime(this.timestamp);
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
      <div class="message-group-content">
        <div>
          <strong>{{ userName }}</strong>
          <span class="timestamp">{{ readableTimestamp }}</span>
        </div>

        <ul class="message-list">
          <message-item
            v-for="message in messages"
            v-bind:key="message.timestamp"
            v-bind:message="message"
            v-bind:allUsers="allUsers">
          </message-item>
        </ul>
      </div>
    </div>
  `
});

Vue.component("message-item", {
  props: ["message", "allUsers"],
  computed: {
    hasReplies: function() {
      return Object.keys(this.message.replies).length > 0;
    }
  },
  template: /* html */ `
    <li v-bind:class="{ unread: message.isUnread }">
      <div v-if="message.textHTML" v-html="message.textHTML"></div>
      <span v-if="message.isEdited" class="edited">(edited)</span>
      <message-reactions v-bind:reactions="message.reactions"></message-reactions>
      <message-content
        v-if="message.content" v-bind:content="message.content">
      </message-content>
      <message-replies
        v-if="hasReplies" v-bind:message="message" v-bind:allUsers="allUsers">
      </message-replies>
    </li>
  `
});

Vue.component("message-replies", {
  props: ["message", "allUsers"],
  data: function() {
    return {
      isExpanded: false
    };
  },
  methods: {
    expandHandler: function(event) {
      this.isExpanded = !this.isExpanded;

      if (this.isExpanded) {
        const hasPendingText =
          Object.keys(this.message.replies).filter(
            replyTs => !this.message.replies[replyTs].textHTML
          ).length > 0;

        if (hasPendingText) {
          vscode.postMessage({
            type: "internal",
            text: "fetch_replies",
            parentTimestamp: this.message.timestamp
          });
        }
      }
    },
    onSubmit: function(text) {
      const payload = { text, parentTimestamp: this.message.timestamp };
      sendMessage(payload, "thread_reply");
    }
  },
  computed: {
    imageUrls: function() {
      const userIds = Object.keys(this.message.replies).map(
        replyTs => this.message.replies[replyTs].userId
      );
      const uniques = userIds.filter(
        (item, pos) => userIds.indexOf(item) == pos
      );
      return uniques
        .filter(userId => userId in this.allUsers)
        .filter(userId => !!this.allUsers[userId].smallImageUrl)
        .map(userId => this.allUsers[userId].smallImageUrl);
    },
    placeholder: function() {
      return "Reply to thread";
    },
    count: function() {
      return Object.keys(this.message.replies).length;
    },
    expandText: function() {
      return this.isExpanded ? "Show less" : "Show all";
    }
  },
  template: /* html */ `
    <div class="replies-container">
      <div class="replies-summary">
        <message-replies-images v-bind:images="imageUrls"></message-replies-images>
        <div>{{count}} replies</div>
        <div><a class="pointer" v-on:click="expandHandler">{{expandText}}</a></div>
      </div>
      <ul v-if="isExpanded" class="replies">
        <message-reply-item
          v-for="reply in message.replies"
          v-bind:key="reply.timestamp"
          v-bind:allUsers="allUsers"
          v-bind:userId="reply.userId"
          v-bind:timestamp="reply.timestamp"
          v-bind:textHTML="reply.textHTML">
        </message-reply-item>
      </ul>
      <message-input
        v-if="isExpanded"
        v-bind:placeholder="placeholder"
        v-bind:onSubmit="onSubmit"
        ref="threadFormSection">
      </message-input>
    </div>
  `
});

Vue.component("message-reply-item", {
  props: ["userId", "timestamp", "textHTML", "allUsers"],
  computed: {
    username: function() {
      const user = this.allUsers[this.userId];
      return !!user ? user.name : this.userId;
    },
    readableTimestamp: function() {
      return formattedTime(this.timestamp);
    }
  },
  template: /* html */ `
    <li>
      <span>
        <strong>{{username}}</strong>
        <span class="timestamp">{{ readableTimestamp }}:</span>
      </span>
      <span v-if="textHTML" v-html="textHTML"></span>
    </li>
  `
});

Vue.component("message-replies-images", {
  props: ["images"],
  template: /* html */ `
    <div class="reply-images-container">
      <img v-for="url in images" v-bind:src="url" class="reply-image"></img>
    </div>
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
  props: ["emoji", "count", "users"],
  template: /* html */ `
    <li>
      <div>{{emoji}}</div>
      <div>{{count}}</div>
    </li>
  `
});

Vue.component("message-content", {
  // This renders the attachment portion of the message
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
      <a
        v-bind:href="content.titleLink"
        v-bind:onclick="titleOnclick"
        v-bind:tabindex="-1">
        {{ content.title }}
      </a>
    </div>
  `
});

Vue.component("message-input", {
  props: ["placeholder", "onSubmit"],
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
      text: "",
      inComposition: false
    };
  },
  template: /* html */ `
    <form class="message-input-form" v-on:submit="onSubmitFunc">
      <textarea
        ref="messageInput"
        v-model="text"
        v-bind:placeholder="placeholder"
        v-on:keydown="onKeydown"
        v-on:keydown.meta.65="onSelectAll"
        v-on:focus="onFocus"
        v-focus
        rows="1">
      </textarea>
      <input type="submit"></input>
    </form>
  `,
  mounted() {
    this.$refs.messageInput.addEventListener("compositionstart", event => {
      this.inComposition = true;
    });
    this.$refs.messageInput.addEventListener("compositionend", event => {
      this.inComposition = false;
    });
  },
  methods: {
    onSubmitFunc: function(event) {
      this.onSubmit(this.text);
      this.text = "";
    },
    onFocus: function(event) {
      return sendMessage("is_focused", "internal");
    },
    onSelectAll: function(event) {
      // Should we check for keydown.ctrl.65 on Windows?
      this.$refs.messageInput.select();
    },
    onKeydown: function(event) {
      // Usability fixes
      // 1. Multiline support: only when shift + enter are pressed
      // 2. Submit on enter (without shift)
      if (event.code === "Enter" && !event.shiftKey && !this.inComposition) {
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
  }
});

Vue.component("form-section", {
  props: ["channel", "status"],
  computed: {
    placeholder: function() {
      return `Message ${!!this.channel ? this.channel.name : ""}`;
    }
  },
  methods: {
    onSubmit: function(text) {
      const type = text.startsWith("/") ? "command" : "text";
      sendMessage(text, type);
    }
  },
  template: /* html */ `
    <div class="form-section">
      <message-input
        v-bind:onSubmit="onSubmit"
        v-bind:placeholder="placeholder">
      </message-input>
      <status-text v-bind:status="status"></status-text>
    </div>
  `,
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
