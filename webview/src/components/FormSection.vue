<template>
    <div class="form-section">
        <div>
            <message-input
                v-bind:onSubmit="onSubmit"
                v-bind:users="users"
                v-bind:placeholderText="placeholder">
            </message-input>
            <status-text v-bind:status="status"></status-text>
        </div>
    </div>
</template>

<script>
import Vue from 'vue';
import StatusText from './StatusText.vue'
import MessageInput from './MessageInput.vue'
import { sendMessage } from '../utils';

export default {
    name: 'form-section',
    props: ['channel', 'users', 'status', 'atMentions'],
    components: {
        StatusText, MessageInput
    },
    computed: {
        placeholder: function() {
            return `Message ${this.channel ? this.channel.name : ""}`;
        }
    },
    methods: {
        onSubmit: function(text) {
            const type = text.startsWith("/") ? "command" : "text";
            sendMessage(text, type);
        }
    },
    mounted() {
        return sendMessage("is_ready", "internal");
    }
}
</script>
