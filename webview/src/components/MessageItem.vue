<template>
    <li v-bind:class="{ unread: message.isUnread }">
        <div v-if="message.textHTML" v-html="message.textHTML"></div>
        <span v-if="message.isEdited" class="edited">(edited)</span>
        <message-reactions v-bind:reactions="message.reactions"></message-reactions>
        <message-content
            v-if="message.content" v-bind:content="message.content">
        </message-content>
        <message-replies
            v-if="hasReplies" v-bind:message="message" v-bind:allUsers="allUsers">
        </message-replies>
    </li>
</template>

<script>
import MessageContent from './MessageContent.vue'
import MessageReactions from './MessageReactions.vue'
import MessageReplies from './MessageReplies.vue'

export default {
    name: 'message-item',
    props: ['message', 'allUsers'],
    computed: {
        hasReplies: function() {
            return Object.keys(this.message.replies).length > 0;
        }
    },
    components: {
        MessageContent,
        MessageReplies,
        MessageReactions
    }
}
</script>
