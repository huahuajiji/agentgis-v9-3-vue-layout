<script setup lang="ts">
withDefaults(defineProps<{
  kind?: 'row' | 'field' | 'block' | 'composer';
}>(), {
  kind: 'row'
});
</script>

<template>
  <div :class="`placeholder placeholder-${kind}`"></div>
</template>
