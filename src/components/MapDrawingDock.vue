<script setup lang="ts">
import type { AmapDrawGeometry, AmapDrawingState } from '../shared/amap/amapDrawingSession';

defineProps<{
  enabled: boolean;
  message: string;
  ready: boolean;
  state: AmapDrawingState;
  submitDisabled: boolean;
}>();

const emit = defineEmits<{
  clearDrafts: [];
  start: [geometry: AmapDrawGeometry];
  stop: [];
  submitDrafts: [];
}>();

const drawOptions: Array<{ id: AmapDrawGeometry; label: string }> = [
  { id: 'point', label: '点' },
  { id: 'line', label: '线' },
  { id: 'polygon', label: '面' }
];
</script>

<template>
  <aside v-if="enabled" class="map-drawing-dock">
    <div class="map-drawing-row">
      <button
        v-for="item in drawOptions"
        :key="item.id"
        class="button map-drawing-button"
        :class="{ active: state.geometry === item.id }"
        type="button"
        :disabled="!ready"
        @click="emit('start', item.id)"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="map-drawing-row">
      <button class="button" type="button" :disabled="!state.active" @click="emit('stop')">停止</button>
      <button class="button" type="button" :disabled="!state.draftCount" @click="emit('clearDrafts')">清空</button>
      <button
        class="button primary"
        type="button"
        :disabled="submitDisabled || !state.draftCount"
        @click="emit('submitDrafts')"
      >
        提交 {{ state.draftCount || '' }}
      </button>
    </div>

    <div class="map-drawing-meta">
      <span>{{ message }}</span>
      <span>
        草稿 {{ state.draftCount }}
        <template v-if="state.failedDraftCount"> · 异常 {{ state.failedDraftCount }}</template>
      </span>
    </div>
  </aside>
</template>
