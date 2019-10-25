<template>
    <li>
        <span>
            <strong>{{username}}</strong>
            &nbsp;
            <span class="timestamp">{{ readableTimestamp }}:</span>
        </span>
        &nbsp;
        <markdown-element
            v-if="text"
            v-bind:text="text"
            v-bind:inline="true">
        </markdown-element>
    </li>
</template>

<script>
import MarkdownElement from './MarkdownElement'
import { formattedTime } from '../utils';

export default {
    name: 'message-reply-item',
    props: ['userId', 'timestamp', 'text', 'users'],
    components: {
        MarkdownElement
    },
    computed: {
        username: function() {
            const user = this.users[this.userId];
            return user ? user.name : this.userId;
        },
        readableTimestamp: function() {
            return formattedTime(this.timestamp);
        }
    },
}
</script>
