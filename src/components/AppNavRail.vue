<script setup lang="ts">
import type { NavSection } from '../types';

defineProps<{
  activeSection: NavSection;
  accountOpen: boolean;
}>();

const emit = defineEmits<{
  selectSection: [section: NavSection];
  openAccount: [];
}>();

const topSections: NavSection[] = ['地图', '项目', '数据', 'AI', '历史', '设置'];
</script>

<template>
  <nav class="nav" aria-label="主导航栏">
    <div class="nav-mark">AG</div>
    <button
      v-for="section in topSections"
      :key="section"
      class="nav-button"
      :class="{ active: activeSection === section }"
      type="button"
      @click="emit('selectSection', section)"
    >
      {{ section }}
    </button>
    <div></div>
    <button
      class="nav-button"
      :class="{ active: accountOpen }"
      type="button"
      @click="emit('openAccount')"
    >
      账户
    </button>
  </nav>
</template>
