import Vue from 'vue'
import App from './App.vue'

var app = new Vue({
    template: `<app :messages="messages" :users="users" :channel="channel"> </app>`,
    // TODO: add fontFamily and fontSize
    props: ['messages', 'users', 'channel', 'statusText', 'atMentions'],
    components: { App },
    el: '#app',
})

window.addEventListener('message', message => {
    // TODO: we don't need to de-structure here, can do inside app-container
    app.messages = message.data.messages;
    app.users = message.data.users;
    app.channel = message.data.channel;
    app.statusText = message.data.statusText;
    app.atMentions = message.data.atMentions;
})
