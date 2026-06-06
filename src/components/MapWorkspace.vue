<script setup lang="ts">
import { computed } from 'vue';
import AmapBaseMap from './AmapBaseMap.vue';
import MapBoundsFrame from './MapBoundsFrame.vue';
import MapCommandBar from './MapCommandBar.vue';
import type { MapAction, MapMode, MapTool } from '../types';

const props = defineProps<{
  geometryEditFeatureId: string | null;
}>();

const mode = defineModel<MapMode>('mode', { required: true });
const tool = defineModel<MapTool>('tool', { required: true });
const mapAction = defineModel<MapAction>('mapAction', { required: true });
const emit = defineEmits<{
  saveDraft: [];
}>();

const mapLabel = computed(() => {
  const suffix = [tool.value, mapAction.value].filter(Boolean).join(' / ');
  const editTarget = props.geometryEditFeatureId ? ` · 编辑 ${props.geometryEditFeatureId}` : '';
  return `当前：${mode.value}${suffix ? ` · ${suffix}` : ''}${editTarget}`;
});
const drawingEnabled = computed(() => mode.value === '编辑' && tool.value === '绘制');
</script>

<template>
  <section class="map-column">
    <MapCommandBar
      v-model:mode="mode"
      v-model:tool="tool"
      @save-draft="emit('saveDraft')"
    />

    <section class="map">
      <AmapBaseMap
        :drawing-enabled="drawingEnabled"
        :geometry-edit-feature-id="geometryEditFeatureId"
        :status-text="mapLabel"
      />
      <MapBoundsFrame />
    </section>
  </section>
</template>
