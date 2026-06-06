<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMapDocumentStore, type LayerRole, type MapFeature, type MapLayer } from '../../stores/mapDocumentStore';
import ConfirmActionDialog from './ConfirmActionDialog.vue';
import FeaturePropertyTable from './FeaturePropertyTable.vue';
import TextInputDialog from './TextInputDialog.vue';

const props = withDefaults(defineProps<{
  variant?: LayerRole;
  sorting?: boolean;
}>(), {
  variant: 'work',
  sorting: false
});

const mapDocumentStore = useMapDocumentStore();
const openLayers = ref<Set<string>>(new Set());
const layerOrder = ref<string[]>([]);
const draggedLayerId = ref<string | null>(null);
const renameLayerDialogOpen = ref(false);
const deleteLayerDialogOpen = ref(false);
const selectedActionLayer = ref<MapLayer | null>(null);

const sourceLayers = computed(() => (
  mapDocumentStore.activeDocument.layers
    .filter((layer) => layer.role === props.variant)
    .slice()
    .sort((a, b) => a.order - b.order)
));
const sourceLayerSignature = computed(() => (
  sourceLayers.value.map((layer) => `${layer.id}:${layer.order}`).join('|')
));

const orderedLayers = computed(() => {
  const layerById = new Map(sourceLayers.value.map((layer) => [layer.id, layer]));
  const ordered = layerOrder.value
    .map((id) => layerById.get(id))
    .filter((layer): layer is MapLayer => Boolean(layer));
  const missing = sourceLayers.value.filter((layer) => !layerOrder.value.includes(layer.id));

  return [...ordered, ...missing];
});

watch(
  sourceLayerSignature,
  () => {
    const layers = sourceLayers.value;
    const layerIds = new Set(layers.map((layer) => layer.id));
    const nextOpenLayers = new Set([...openLayers.value].filter((layerId) => layerIds.has(layerId)));
    if (!nextOpenLayers.size && layers[0]) {
      nextOpenLayers.add(layers[0].id);
    }

    layerOrder.value = layers.map((layer) => layer.id);
    openLayers.value = nextOpenLayers;
    draggedLayerId.value = null;
  },
  { immediate: true }
);

const selectedLayerId = computed(() => mapDocumentStore.activeDocument.selectedLayerId);
const selectedFeatureId = computed(() => mapDocumentStore.activeDocument.selectedFeatureId);
const selectedActionLayerSummary = computed(() => {
  if (!selectedActionLayer.value) {
    return [];
  }

  const layer = selectedActionLayer.value;
  return [
    { label: '图层名称', value: layer.name },
    { label: '图层归属', value: roleLabel(layer) },
    { label: '图层类型', value: geometryLabel(layer) },
    { label: '要素数量', value: getLayerFeatures(layer).length }
  ];
});

const deleteLayerDescription = computed(() => {
  if (!selectedActionLayer.value) {
    return '图层里的要素也会一起删除。';
  }

  return `删除图层「${selectedActionLayer.value.name}」？图层里的要素也会一起删除。`;
});

watch(selectedLayerId, (layerId) => {
  if (!layerId || !sourceLayers.value.some((layer) => layer.id === layerId)) {
    return;
  }

  openLayers.value = new Set([...openLayers.value, layerId]);
});

function roleLabel(layer: MapLayer) {
  return layer.role === 'reference' ? '参考图层' : '正式图层';
}

function geometryLabel(layer: MapLayer) {
  const labels: Record<MapLayer['geometryType'], string> = {
    point: '点',
    line: '线',
    polygon: '面',
    mixed: '混合'
  };
  return labels[layer.geometryType];
}

function getLayerFeatures(layer: MapLayer): MapFeature[] {
  return layer.featureIds
    .map((featureId) => mapDocumentStore.activeDocument.features[featureId])
    .filter((feature): feature is MapFeature => Boolean(feature));
}

function getFeatureName(feature: MapFeature) {
  const properties = feature.geojson.properties;
  const value = properties && typeof properties.name === 'string'
    ? properties.name
    : feature.id;
  return value;
}

function toggleLayer(layerId: string) {
  if (props.sorting) {
    return;
  }

  mapDocumentStore.selectLayer(layerId);

  const next = new Set(openLayers.value);
  if (next.has(layerId)) {
    next.delete(layerId);
  } else {
    next.add(layerId);
  }
  openLayers.value = next;
}

function toggleFeature(featureId: string) {
  if (props.sorting) {
    return;
  }

  mapDocumentStore.selectFeature(selectedFeatureId.value === featureId ? null : featureId);
}

function startDrag(layerId: string) {
  if (!props.sorting) {
    return;
  }
  draggedLayerId.value = layerId;
}

function moveLayer(targetLayerId: string) {
  const sourceLayerId = draggedLayerId.value;
  if (sourceLayerId === null || sourceLayerId === targetLayerId) {
    return;
  }

  const next = [...layerOrder.value];
  const sourceIndex = next.indexOf(sourceLayerId);
  const targetIndex = next.indexOf(targetLayerId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }

  next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceLayerId);
  layerOrder.value = next;
}

function endDrag() {
  if (draggedLayerId.value) {
    mapDocumentStore.reorderLayers(layerOrder.value);
  }
  draggedLayerId.value = null;
}

function toggleLayerVisible(layer: MapLayer, event: Event) {
  event.stopPropagation();
  if (props.sorting) {
    return;
  }

  mapDocumentStore.setLayerVisible(layer.id, !layer.visible);
}

function openRenameLayerDialog(layer: MapLayer, event: Event) {
  event.stopPropagation();
  if (props.sorting) {
    return;
  }

  selectedActionLayer.value = layer;
  renameLayerDialogOpen.value = true;
}

function confirmRenameLayer(name: string) {
  if (!selectedActionLayer.value || name === selectedActionLayer.value.name) {
    return;
  }

  mapDocumentStore.renameLayer({
    layerId: selectedActionLayer.value.id,
    name
  });
  selectedActionLayer.value = null;
}

function openDeleteLayerDialog(layer: MapLayer, event: Event) {
  event.stopPropagation();
  if (props.sorting) {
    return;
  }

  selectedActionLayer.value = layer;
  deleteLayerDialogOpen.value = true;
}

function confirmDeleteLayer() {
  if (!selectedActionLayer.value) {
    return;
  }

  mapDocumentStore.deleteLayer(selectedActionLayer.value.id);
  selectedActionLayer.value = null;
}
</script>

<template>
  <div v-if="orderedLayers.length" class="layer-tree" :class="{ 'is-sorting': sorting }">
    <section
      v-for="layer in orderedLayers"
      :key="layer.id"
      class="layer-tree-item"
      :class="{
        dragging: draggedLayerId === layer.id,
        reference: layer.role === 'reference',
        active: selectedLayerId === layer.id,
        hidden: !layer.visible
      }"
      :draggable="sorting"
      @dragstart="startDrag(layer.id)"
      @dragover.prevent
      @dragenter.prevent="moveLayer(layer.id)"
      @dragend="endDrag"
      @drop.prevent="endDrag"
    >
      <div class="layer-tree-head">
        <button class="layer-tree-toggle" type="button" @click="toggleLayer(layer.id)">
          <span>{{ sorting ? '↕' : openLayers.has(layer.id) ? '▾' : '▸' }}</span>
          <span class="layer-title">
            <b>{{ layer.name }}</b>
            <span>{{ roleLabel(layer) }} · {{ geometryLabel(layer) }} · {{ getLayerFeatures(layer).length }} 个要素</span>
          </span>
        </button>
        <div class="layer-row-actions">
          <button
            class="layer-action-button"
            :class="{ muted: !layer.visible }"
            type="button"
            :aria-pressed="layer.visible"
            :title="layer.visible ? '隐藏图层' : '显示图层'"
            @click="toggleLayerVisible(layer, $event)"
          >
            {{ layer.visible ? '显' : '隐' }}
          </button>
          <button
            class="layer-action-button"
            type="button"
            title="重命名图层"
            @click="openRenameLayerDialog(layer, $event)"
          >
            改
          </button>
          <button
            class="layer-action-button danger"
            type="button"
            title="删除图层"
            @click="openDeleteLayerDialog(layer, $event)"
          >
            删
          </button>
        </div>
      </div>

      <div v-if="!sorting && openLayers.has(layer.id)" class="layer-tree-body">
        <div v-for="feature in getLayerFeatures(layer)" :key="feature.id" class="feature-node">
          <button
            class="feature-row"
            :class="{ active: selectedFeatureId === feature.id }"
            type="button"
            @click="toggleFeature(feature.id)"
          >
            <span class="feature-dot">•</span>
            <span>{{ getFeatureName(feature) }}</span>
            <small>{{ feature.geojson.geometry.type }}</small>
          </button>

          <div v-if="selectedFeatureId === feature.id" class="feature-inline-inspector">
            <FeaturePropertyTable
              :feature="feature"
              :layer="layer"
            />
          </div>
        </div>

        <div v-if="!getLayerFeatures(layer).length" class="empty-state compact">
          <b>暂无要素</b>
          <span>这个图层已经接到 MapDocument，但 featureIds 为空。</span>
        </div>
      </div>
    </section>
  </div>

  <div v-else class="empty-state">
    <b>暂无图层</b>
    <span>当前 MapDocument 里没有这个类型的图层。</span>
  </div>

  <TextInputDialog
    v-model:open="renameLayerDialogOpen"
    dialog-id="rename-layer-dialog"
    title="重命名图层"
    description="只修改图层名称，不影响图层下的要素。"
    label="图层名称"
    placeholder="请输入图层名称"
    :initial-value="selectedActionLayer?.name ?? ''"
    :summary-rows="selectedActionLayerSummary"
    confirm-text="保存"
    @confirm="confirmRenameLayer"
  />

  <ConfirmActionDialog
    v-model:open="deleteLayerDialogOpen"
    dialog-id="delete-layer-dialog"
    title="删除图层"
    :description="deleteLayerDescription"
    :summary-rows="selectedActionLayerSummary"
    confirm-text="删除"
    danger
    @confirm="confirmDeleteLayer"
  />
</template>
