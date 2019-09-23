<template>
    <ul class="message-reactions">
        <message-reaction v-for="reaction in reactions"
            v-bind:emoji="reaction.name"
            v-bind:count="reaction.count"
            v-bind:users="reaction.userIds"
            v-bind:key="reaction.name">
        </message-reaction>
    </ul>
</template>

<script>
import MessageReaction from './MessageReaction.vue'

export default {
    name: 'message-reactions',
    props: ['reactions'],
    components: {
        MessageReaction
    }
}
</script>