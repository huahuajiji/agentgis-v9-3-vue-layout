<script setup lang="ts">
import type { MobileTab } from '../../types';

const activeTab = defineModel<MobileTab>('activeTab', { required: true });

const tabs: Array<{ id: MobileTab; label: string }> = [
  { id: 'map', label: '地图' },
  { id: 'info', label: '信息' },
  { id: 'edit', label: '编辑' },
  { id: 'mine', label: '我的' }
];
</script>

<template>
  <nav class="mobile-tabbar" aria-label="底部导航">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="mobile-tab"
      :class="{ active: activeTab === tab.id }"
      type="button"
      @click="activeTab = tab.id"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>
