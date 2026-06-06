<script setup lang="ts">
import type { MapTool } from '../types';

const tool = defineModel<MapTool>({ required: true });

const tools: Exclude<MapTool, ''>[] = ['选择', '绘制', '导入'];

function toggleTool(nextTool: Exclude<MapTool, ''>) {
  tool.value = tool.value === nextTool ? '' : nextTool;
}
</script>

<template>
  <div class="mode-tool-dock">
    <button
      v-for="item in tools"
      :key="item"
      class="button map-tool-button"
      :class="{ active: tool === item }"
      type="button"
      @click="toggleTool(item)"
    >
      {{ item }}
    </button>
  </div>
</template>
