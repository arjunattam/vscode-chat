<template>
    <li>
        <span>
            <strong>{{username}}</strong>
            &nbsp;
            <span class="timestamp">{{ readableTimestamp }}:</span>
        </span>
        &nbsp;
        <span v-if="textHTML" v-html="textHTML"></span>
    </li>
</template>

<script>
import { formattedTime } from '../utils';

export default {
    name: 'message-reply-item',
    props: ["userId", "timestamp", "textHTML", "allUsers"],
    computed: {
        username: function() {
            const user = this.allUsers[this.userId];
            return user ? user.name : this.userId;
        },
        readableTimestamp: function() {
            return formattedTime(this.timestamp);
        }
    },
}
</script>
