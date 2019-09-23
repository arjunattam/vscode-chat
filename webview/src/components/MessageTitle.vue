<template>
    <div class="msg-title">
        <a
            v-bind:href="content.titleLink"
            v-bind:onclick="titleOnclick"
            v-bind:tabindex="-1">
        {{ content.title }}
        </a>
    </div>
</template>

<script>
import { sendMessage } from '../utils';

function openLink(href) {
    // Handler for <a> tags in this view
    console.log('link clicked')
    return sendMessage(href, "link");
}

export default {
    name: 'message-title',
    props: ['content'],
    computed: {
        titleOnclick: function() {
            openLink(this.content.titleLink);
            return false;
        }
    },
}
</script>