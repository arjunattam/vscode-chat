<template>
    <div
        v-if="html"
        v-bind:style="inlineStyleObject"
        v-html="html">
    </div>
</template>

<script>
import * as MarkdownIt from "markdown-it";
import * as MarkdownItSlack from "markdown-it-slack";

function getAttachmentLink(name, permalink) {
    return `[${name}](${permalink})`;
};

export default {
    name: 'markdown-element',
    props: ['text', 'inline'],
    computed: {
        html: function() {
            const md = new MarkdownIt({ breaks: true }).use(MarkdownItSlack);
            return this.inline ? md.renderInline(this.text) : md.render(this.text);
        },
        inlineStyleObject: function() {
            return { display: this.inline ? 'inline' : 'block' }
        }
    }
}
</script>
