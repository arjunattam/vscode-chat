<template>
    <div class="msg-author">
        <img v-bind:src="content.authorIcon" />
        <span>{{ content.author }}</span>
    </div>
</template>

<script>
export default {
    name: 'message-author',
    props: ['content']
}
</script>
