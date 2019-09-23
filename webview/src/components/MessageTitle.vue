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
export default {
    name: 'message-title',
    props: ['content'],
    computed: {
        titleOnclick: function() {
            return `openLink('${this.content.titleLink}'); return false;`;
        }
    },
}
</script>