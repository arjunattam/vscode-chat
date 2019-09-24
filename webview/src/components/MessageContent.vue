<template>
    <div class="li-line" v-bind:style="{ borderColor: borderColor }">
        <div v-if="content.pretext">{{ content.pretext }} </div>
        <message-author v-if="content.author" v-bind:content="content"></message-author>
        <message-title v-if="content.title" v-bind:content="content"></message-title>
        <markdown-element
            v-if="content.text"
            v-bind:text="content.text"
            v-bind:inline="false">
        </markdown-element>
        <markdown-element
            v-if="content.footer"
            v-bind:text="content.footer"
            v-bind:inline="true">
        </markdown-element>
    </div>
</template>

<script>
import MessageTitle from './MessageTitle.vue';
import MessageAuthor from './MessageAuthor.vue';
import MarkdownElement from './MarkdownElement';

export default {
    name: 'message-content',
    props: ['content'],
    computed: {
        borderColor: function() {
            const { borderColor } = this.content;
            const defaultColor = `var(--vscode-scrollbarSlider-activeBackground)`;
            return borderColor ? `#${borderColor}` : defaultColor;
        }
    },
    components: {
        MessageTitle,
        MessageAuthor,
        MarkdownElement
    }
}
</script>