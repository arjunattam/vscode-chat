<template>
    <li>
        <div>{{emoji}}</div>
        <div>{{count}}</div>
    </li>
</template>

<script>
export default {
    name: 'message-reaction',
    props: ['emoji', 'count', 'users']
}
</script>