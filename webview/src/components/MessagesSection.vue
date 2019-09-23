<template>
    <div class="messages-section">
        <messages-date-group
            v-for="dateGroup in messages"
            v-bind:users="users"
            v-bind:key="dateGroup.date"
            v-bind:groups="dateGroup.groups"
            v-bind:date="dateGroup.date">
        </messages-date-group>
    </div>
</template>

<script>
import Vue from 'vue';
import MessagesDateGroup from './MessagesDateGroup.vue'
import { sendMessage } from '../utils';

function openLink(href) {
    // Handler for <a> tags in this view
    console.log('link clicked')
    return sendMessage(href, "link");
}

export default {
    name: 'messages-section',
    props: ["messages", "users"],
    components: {
        MessagesDateGroup
    },
    data: function() {
        return {
            messagesLength: 0
        };
    },
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
}
</script>
