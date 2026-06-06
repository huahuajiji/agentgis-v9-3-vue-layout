<script setup lang="ts">
import type { MapMode, MapTool } from '../types';
import { useMapDocumentStore } from '../stores/mapDocumentStore';
import MapModeSelector from './MapModeSelector.vue';

const mode = defineModel<MapMode>('mode', { required: true });
const tool = defineModel<MapTool>('tool', { required: true });
const emit = defineEmits<{
  saveDraft: [];
}>();
const mapDocumentStore = useMapDocumentStore();

function exportGeoJson() {
  const geojson = mapDocumentStore.exportGeoJson({
    includeInternalProperties: true
  });
  const blob = new Blob([JSON.stringify(geojson, null, 2)], {
    type: 'application/geo+json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');

  link.href = url;
  link.download = `${toSafeFileName(mapDocumentStore.activeDocument.name)}.geojson`;
  link.click();
  URL.revokeObjectURL(url);
}

function toSafeFileName(value: string) {
  const safeName = value.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return safeName || 'map-document';
}
</script>

<template>
  <nav class="modebar">
    <div class="map-command-left">
      <MapModeSelector v-model:mode="mode" v-model:tool="tool" />
    </div>
    <div class="map-command-actions">
      <button class="button" type="button" @click="exportGeoJson">导出 GeoJSON</button>
      <button
        class="button primary map-save-button"
        type="button"
        :disabled="mapDocumentStore.activeDocumentRef.kind !== 'draft'"
        @click="emit('saveDraft')"
      >
        {{ mapDocumentStore.activeDocumentRef.kind === 'draft' ? '保存' : '已保存' }}
      </button>
    </div>
  </nav>
</template>
