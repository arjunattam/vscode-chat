<template>
    <div class="messages-date-section">
        <date-separator v-bind:date="date"></date-separator>
        <message-group
            v-for="group in groups"
            v-bind:key="group.key"
            v-bind:messages="group.messages"
            v-bind:allUsers="users"
            v-bind:userId="group.userId"
            v-bind:user="group.user"
            v-bind:timestamp="group.minTimestamp">
        </message-group>
    </div>
</template>

<script>
import MessageGroup from "./MessageGroup.vue";
import DateSeparator from './DateSeparator.vue'

export default {
    props: ["groups", "users", "date"],
    components: {
        DateSeparator,
        MessageGroup
    }    
}
</script>