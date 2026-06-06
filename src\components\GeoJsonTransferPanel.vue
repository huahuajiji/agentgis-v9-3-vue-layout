<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Feature as GeoJsonFeature, FeatureCollection } from 'geojson';
import { useMapDocumentStore, type LayerRole } from '../stores/mapDocumentStore';

type GeoJsonImportPayload = GeoJsonFeature | FeatureCollection;

const mapDocumentStore = useMapDocumentStore();

const fileInput = ref<HTMLInputElement | null>(null);
const importRole = ref<LayerRole>('work');
const splitByGeometryType = ref(true);
const statusMessage = ref('');
const errorMessage = ref('');
const isImporting = ref(false);

const activeDocument = computed(() => mapDocumentStore.activeDocument);
const layerCount = computed(() => activeDocument.value.layers.length);
const featureCount = computed(() => Object.keys(activeDocument.value.features).length);

function openImportPicker() {
  fileInput.value?.click();
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';

  if (!file) {
    return;
  }

  isImporting.value = true;
  statusMessage.value = '';
  errorMessage.value = '';

  try {
    const content = await file.text();
    const geojson = JSON.parse(content) as GeoJsonImportPayload;
    const result = mapDocumentStore.importGeoJson({
      geojson,
      role: importRole.value,
      splitByGeometryType: splitByGeometryType.value
    });

    if (!result) {
      throw new Error('当前 MapDocument 无法写入');
    }

    statusMessage.value = `已导入 ${result.importedFeatureIds.length} 个要素，影响 ${result.touchedLayerIds.length} 个图层。`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'GeoJSON 导入失败';
  } finally {
    isImporting.value = false;
  }
}

</script>

<template>
  <div class="geojson-transfer-panel">
    <input
      id="geojson-import-file"
      ref="fileInput"
      name="geoJsonImportFile"
      class="visually-hidden"
      type="file"
      accept=".geojson,.json,application/geo+json,application/json"
      @change="handleImportFile"
    >

    <section class="detail-card">
      <div class="detail-body">
        <div class="detail-grid">
          <div class="detail-field">
            <span>当前地图</span>
            <b>{{ activeDocument.name }}</b>
          </div>
          <div class="detail-field">
            <span>图层数量</span>
            <b>{{ layerCount }}</b>
          </div>
          <div class="detail-field">
            <span>要素数量</span>
            <b>{{ featureCount }}</b>
          </div>
          <div class="detail-field">
            <span>导入格式</span>
            <b>Feature / FeatureCollection</b>
          </div>
        </div>
      </div>
    </section>

    <div class="geojson-options">
      <label class="geojson-option-row" for="geojson-import-role">
        <span>导入图层</span>
        <select id="geojson-import-role" v-model="importRole" name="geoJsonImportRole">
          <option value="work">正式图层</option>
          <option value="reference">参考图层</option>
        </select>
      </label>

      <label class="geojson-check" for="geojson-split-by-geometry">
        <input
          id="geojson-split-by-geometry"
          v-model="splitByGeometryType"
          name="geoJsonSplitByGeometry"
          type="checkbox"
        >
        <span>导入时按点、线、面自动分层</span>
      </label>
    </div>

    <div class="geojson-actions single">
      <button class="button" type="button" :disabled="isImporting" @click="openImportPicker">
        {{ isImporting ? '导入中' : '导入 GeoJSON' }}
      </button>
    </div>

    <p v-if="statusMessage" class="transfer-message success">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="transfer-message error">{{ errorMessage }}</p>
  </div>
</template>
