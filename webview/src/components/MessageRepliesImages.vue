<template>
    <div class="reply-images-container">
        <img v-for="url in images" v-bind:src="url" :key="url" class="reply-image" />
    </div>
</template>

<script>
export default {
    name: 'message-replies-images',
    props: ["images"],
}
</script>
