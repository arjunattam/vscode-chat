<template>
    <div class="user-info">This is some text in a div.</div>
</template>

<script>
export default {
    name: 'user-info',
    props: ['user', 'actions']
}
</script>

<style>
.user-info {
    width: 100px;
    height: 100px;
    background-color: red;

    visibility: hidden;
    position: absolute;
    z-index: 1;
    top: -5px;
    left: 105%;
}
</style>
