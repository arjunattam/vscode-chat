Vue.component("message-group", {
  template: "<ul></ul>"
});

Vue.component("message-item", {
  props: ["message"],
  template: `
    <li>
      <span>{{ message.text }}</span>
      <span>{{ message.userId }}</span>
    </li>
  `
});
