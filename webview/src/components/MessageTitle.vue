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
import { openLink } from '../utils';

export default {
    name: 'message-title',
    props: ['content'],
    methods: {
        titleOnclick: function() {
            openLink(this.content.titleLink);
            return false;
        }
    },
}
</script>
