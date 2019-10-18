<template>
    <form class="message-input-form" v-on:submit="onSubmitFunc">
        <textarea
            ref="messageInput"
            v-model="text"
            v-bind:placeholder="placeholder"
            v-on:keydown.exact="onKeydown"
            v-on:keydown.meta.65="onSelectAll"
            v-on:focus="onFocus"
            v-focus
            rows="1">
        </textarea>
        <input type="submit" />
    </form>
</template>

<script>
import Vue from 'vue';
import { sendMessage } from '../utils';

export default {
    name: 'message-input',
    props: ['placeholder', 'onSubmit'],
    watch: {
        text: function(newText, oldText) {
            if (newText && !newText.trim()) {
                // This is a bit of a hack: using the command palette to change
                // the channel triggers a newline character in the textarea. In this
                // case, the keydown event is not triggered, and so we handle it here.
                this.text = "";
            }
            this.resizeInput();

            const latestChar = newText[newText.length - 1];
            if (latestChar === '@') {
                vscode.postMessage({
                    type: "internal",
                    text: "trigger_at_mention",
                    prefix: ""
                })
            }
        }
    },
    data: function() {
        return {
            text: "",
            inComposition: false,
            sendTypingEvents: true
        };
    },
    mounted() {
        this.$refs.messageInput.addEventListener("compositionstart", event => {
            this.inComposition = true;
        });
        this.$refs.messageInput.addEventListener("compositionend", event => {
            this.inComposition = false;
        });
    },
    methods: {
        onSubmitFunc: function(event) {
            this.onSubmit(this.text);
            this.text = "";
        },
        onFocus: function(event) {
            return sendMessage("is_focused", "internal");
        },
        onSelectAll: function(event) {
            // Should we check for keydown.ctrl.65 on Windows?
            this.$refs.messageInput.select();
        },
        onKeydown: function(event) {
            // Usability fixes
            // 1. Multiline support: only when shift + enter are pressed
            // 2. Submit on enter (without shift)
            if (event.code === "Enter" && !event.shiftKey && !this.inComposition) {
                event.preventDefault();
                
                if (this.text) {
                    event.target.form.dispatchEvent(
                        new Event("submit", { cancelable: true })
                    );
                }
            } else {
                // Typing indicator
                if (this.sendTypingEvents) {
                    this.sendTypingEvents = false;
                    sendMessage("is_typing", "internal");
                    setTimeout(() => {
                        // This timeout value should be slightly lower
                        // than the value used to timeout inside SHOW_TYPING command
                        // so that we don't have a situation where a small gap in typing speed
                        // causes the status text to flicker.
                        this.sendTypingEvents = true;
                    }, 300);
                }
            }
        },
        resizeInput: function() {
            const expectedRows = this.text.split("\n").length;
            const input = this.$refs.messageInput;
            if (input && expectedRows !== input.rows) {
                input.rows = expectedRows;
            }
        }
    }
}

Vue.directive("focus", {
    // When the bound element is inserted into the DOM...
    inserted: function(el) {
        el.focus();
    }
});
</script>