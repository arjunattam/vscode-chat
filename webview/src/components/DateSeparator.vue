<template>
    <h3 class="date-heading">{{dateString}}</h3>
</template>

<script>
export default {
    name: 'date-separator',
    props: ["date"],
    computed: {
        dateString: function() {
            const options = { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" };
            return new Date(this.date).toLocaleDateString("en-US", options);
        }
    },
}
</script>
