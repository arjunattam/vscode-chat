import Vue from 'vue'
import App from './App.vue'

var app = new Vue({
    template: `<app-container :messages="messages" :users="users" :channel="channel"> </app-container>`,
    // TODO: add fontFamily and fontSize
    props: ['messages', 'users', 'channel', 'statusText', 'atMentions'],
    components: { App },
    el: '#app',
})

window.addEventListener('message', message => {
    app.messages = message.data.messages;
    app.users = message.data.users;
    app.channel = message.data.channel
    app.statusText = message.data.statusText
    app.atMentions = message.data.atMentions
})
