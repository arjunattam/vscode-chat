<template>
    <div class="li-line" v-bind:style="{ borderColor: borderColor }">
        <div v-if="content.pretext">{{ content.pretext }} </div>
        <message-author v-if="content.author" v-bind:content="content"></message-author>
        <message-title v-if="content.title" v-bind:content="content"></message-title>
        <div v-if="content.textHTML" v-html="content.textHTML"></div>
        <div 
            class="msg-footer" v-if="content.footerHTML"
            v-html="content.footerHTML">
        </div>
    </div>
</template>

<script>
import MessageTitle from './MessageTitle.vue';
import MessageAuthor from './MessageAuthor.vue'

export default {
    name: 'message-content',
    computed: {
        borderColor: function() {
            const { borderColor } = this.content;
            const defaultColor = `var(--vscode-scrollbarSlider-activeBackground)`;
            return borderColor ? `#${borderColor}` : defaultColor;
        }
    },
    components: {
        MessageTitle,
        MessageAuthor
    }
}
</script>