<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{
  inset?: string;
}>(), {
  inset: '20px'
});

const frameElement = ref<HTMLElement | null>(null);

defineExpose({
  frameElement
});
</script>

<template>
  <div
    ref="frameElement"
    class="map-bounds-frame"
    :style="{ inset: props.inset }"
    aria-hidden="true"
    data-map-bounds-frame
  ></div>
</template>
