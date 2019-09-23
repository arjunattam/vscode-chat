import Vue from 'vue'
import App from './App.vue'

var app = new Vue({
    template: `<app :data="data"> </app>`,
    // TODO: add fontFamily and fontSize
    props: ['data'],
    components: { App },
    el: '#app',
})

window.addEventListener('message', event => {
    app.data = event.data;
})
