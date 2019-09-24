<template>
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
                v-bind:users="users"
                v-bind:userId="reply.userId"
                v-bind:timestamp="reply.timestamp"
                v-bind:text="reply.text">
            </message-reply-item>
        </ul>
        <message-input
            v-if="isExpanded"
            v-bind:placeholder="placeholder"
            v-bind:users="users"
            v-bind:onSubmit="onSubmit"
            ref="threadFormSection">
        </message-input>
    </div>
</template>

<script>
import { vscode, sendMessage } from '../utils.js'
import MessageInput from './MessageInput.vue'
import MessageRepliesImages from './MessageRepliesImages.vue'
import MessageReplyItem from './MessageReplyItem.vue'

export default {
    name: 'message-replies',
    props: ['message', 'users'],
    components: {
        MessageRepliesImages,
        MessageReplyItem,
        MessageInput
    },
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
                Object.keys(this.message.replies).filter(ts => !this.message.replies[ts].text).length > 0;

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
            .filter(userId => userId in this.users)
            .filter(userId => this.users[userId].smallImageUrl)
            .map(userId => this.users[userId].smallImageUrl);
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
}
</script>
