<script setup lang="ts">
const emit = defineEmits<{
  toggleSidebar: [];
  toggleInspector: [];
}>();
</script>

<template>
  <div class="head-actions">
    <button class="button" type="button" @click="emit('toggleSidebar')">左栏</button>
    <button class="button" type="button" @click="emit('toggleInspector')">右栏</button>
  </div>
</template>
