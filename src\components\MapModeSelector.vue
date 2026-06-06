<script setup lang="ts">
import type { MapMode, MapTool } from '../types';
import MapModeTools from './MapModeTools.vue';

const mode = defineModel<MapMode>('mode', { required: true });
const tool = defineModel<MapTool>('tool', { required: true });

const modes: MapMode[] = ['浏览', '编辑', '分析'];
</script>

<template>
  <section class="map-mode-selector">
    <div class="mode-tabs">
      <button
        v-for="item in modes"
        :key="item"
        class="tab mode-tab"
        :class="{ active: mode === item }"
        type="button"
        @click="mode = item"
      >
        {{ item }}
      </button>
    </div>

    <MapModeTools v-model="tool" />
  </section>
</template>
