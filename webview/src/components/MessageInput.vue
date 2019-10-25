<template>
    <vue-tribute :options="tributeOptions">
        <p
            ref="messageInput"
            class="editable"
            contenteditable
            v-bind:data-ph="placeholderText"
            v-on:keydown.exact="onKeydown"
            v-on:focus="onFocus"
            v-focus
            @input="onInput"
            @tribute-replaced="onTributeReplaced">
        </p>
    </vue-tribute>
</template>

<script>
import Vue from 'vue';
import VueTribute from 'vue-tribute';
import { sendMessage } from '../utils';

export default {
    name: 'message-input',
    props: ['placeholderText', 'users', 'onSubmit'],
    components: {
        VueTribute
    },
    watch: {
        users: function(newUsers, oldUsers) {
            if (Object.keys(newUsers).length !== Object.keys(oldUsers).length) {
                setTimeout(() => {
                    // We need an async update here to avoid an error, and I don't know why.
                    // https://github.com/syropian/vue-tribute/blob/0f98b64386452b6ecd87898143197f38dd72ac43/dist/vue-tribute.js#L189
                    this.tributeOptions.values = Object.values(newUsers).map(user => {
                        // {key: 'Gordon Ramsey', value: 'gramsey'}
                        return { key: user.name, value: user.name }
                    })
                }, 200)
            }
        }
    },
    data: function() {
        return {
            text: "",
            inComposition: false,
            sendTypingEvents: true,
            tributeOptions: {
                values: [],
                selectTemplate: function(item) {
                    return `<span class="at-mention" contenteditable="false">@${item.original.value}</span>`;
                }
            }
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
            this.clearInput();
        },
        onFocus: function(event) {
            return sendMessage("is_focused", "internal");
        },
        onKeydown: function(event) {
            if (event.code === "Enter" && !event.shiftKey && !this.inComposition) {
                event.preventDefault(); // Don't create a new line

                if (this.text) {
                    this.onSubmitFunc();
                }
            } else {
                if (this.sendTypingEvents) {
                    this.sendTypingEvents = false;
                    sendMessage("is_typing", "internal"); // Typing indicator
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
        clearInput: function() {
            this.text = '';
            this.$refs.messageInput.innerHTML = '';
        },
        onInput: function(event) {
            this.text = event.target.innerText;
            // TODO: To support at-mentions completely, we should use innerHTML
            // instead of innerText. To be able to support that, the "message" text
            // field needs to support HTML.
        },
        onTributeReplaced: function(event) {
            // Called when something is selected from the at-mentions list
            console.log('replaced', event.detail)
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

<style>
.tribute-container ul {
    list-style: none;
    padding-left: 0;
    color: var(--vscode-input-foreground);
    background-color: var(--vscode-input-background);
    max-height: 200px;
    overflow: auto;
}

.tribute-container ul li {
    padding: 5px;
}

.tribute-container ul li.highlight {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
}

span.at-mention {
    color: var(--vscode-textLink-foreground);
}

p.editable {
    width: 100%;
    padding: 7px;
    font-size: inherit;
    font-family: inherit;
    border-radius: 0;
    box-sizing: border-box;
    resize: none;
    color: var(--vscode-input-foreground);
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-sideBar-background);
}

/* Disable blue border around the contenteditable field */
p.editable:focus {
    outline: 0px solid transparent;
    border: 1px solid var(--vscode-focusBorder);
}

/* Enable placeholder on contenteditable */
p.editable:empty:not(:focus):before{
  content:attr(data-ph);
  color: var(--vscode-descriptionForeground);
}
</style>
