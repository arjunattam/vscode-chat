<template>
    <div class="message-group">
        <div class="message-group-image">
            <img v-bind:src="user ? user.imageUrl : null" />
        </div>
        <div class="message-group-content">
            <div>
                <strong>{{ userName }}</strong>
                &nbsp;
                <span class="timestamp">{{ readableTimestamp }}</span>
            </div>
            
            <ul class="message-list">
                <message-item
                    v-for="message in messages"
                    v-bind:key="message.timestamp"
                    v-bind:message="message"
                    v-bind:users="users">
                </message-item>
            </ul>
        </div>
    </div>
</template>

<script>
import MessageItem from './MessageItem.vue'
import { formattedTime } from '../utils';

export default {
    name: 'message-group',
    props: ["messages", "users", "userId", "user", "timestamp"],
    computed: {
        readableTimestamp: function() {
            return formattedTime(this.timestamp);
        },
        userName: function() {
            return this.user ? this.user.name : this.userId;
        }
    },
    components: {
        MessageItem
    }
}
</script>