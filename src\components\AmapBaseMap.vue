<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { loadAmap, type AMapMapInstance } from '../shared/amap/amapLoader';
import {
  AmapEditSession,
  createEmptyAmapEditState
} from '../shared/amap/amapEditSession';
import {
  AmapDrawingSession,
  createEmptyAmapDrawingState,
  type AmapDrawGeometry
} from '../shared/amap/amapDrawingSession';
import { AmapFeatureAdapter } from '../shared/map/amapFeatureAdapter';
import {
  drawGeometryLabel,
  validateDraftFeatureForLayer,
  validateDraftTargetLayer
} from '../shared/mapDocument/mapDocumentDraftValidation';
import {
  useMapDocumentStore,
  type LngLat,
  type MapBounds,
  type MapLayer,
  type MapViewport
} from '../stores/mapDocumentStore';
import { useSettingsStore } from '../stores/settingsStore';
import MapDrawingDock from './MapDrawingDock.vue';

const props = defineProps<{
  drawingEnabled: boolean;
  geometryEditFeatureId: string | null;
  statusText: string;
}>();

const CONTROL_LEFT = '32px';
const TOOLBAR_TOP = '32px';
const GEOLOCATION_TOP = '116px';

const settingsStore = useSettingsStore();
const mapDocumentStore = useMapDocumentStore();
const container = ref<HTMLElement | null>(null);
const map = shallowRef<AMapMapInstance | null>(null);
const loading = ref(false);
const loadError = ref('');
const drawingMessage = ref('先选择一个正式图层，再开始绘制。');
const drawingState = ref(createEmptyAmapDrawingState());
const drawingSession = shallowRef<AmapDrawingSession | null>(null);
const editMessage = ref('选择正式图层里的要素后开始编辑。');
const editState = ref(createEmptyAmapEditState());
const editSession = shallowRef<AmapEditSession | null>(null);
let loadToken = 0;
let featureAdapter: AmapFeatureAdapter | null = null;

const credentials = computed(() => ({
  enabled: settingsStore.settings.byokEnabled,
  jsKey: settingsStore.settings.amapBaseMap.jsKey.trim(),
  securityCode: settingsStore.settings.amapBaseMap.securityCode.trim()
}));

const readyToLoad = computed(() => Boolean(
  credentials.value.enabled
    && credentials.value.jsKey
    && credentials.value.securityCode
));

const activeDocumentKey = computed(() => {
  const activeRef = mapDocumentStore.activeDocumentRef;
  return activeRef.kind === 'saved' ? `saved:${activeRef.id}` : 'draft';
});

const featureRenderKey = computed(() => JSON.stringify({
  activeDocument: activeDocumentKey.value,
  layers: mapDocumentStore.activeDocument.layers.map((layer) => ({
    id: layer.id,
    visible: layer.visible,
    order: layer.order,
    featureIds: layer.featureIds,
    style: layer.style
  })),
  features: Object.values(mapDocumentStore.activeDocument.features).map((feature) => ({
    id: feature.id,
    layerId: feature.layerId,
    geojson: feature.geojson,
    imageResourceId: feature.imageResourceId
  }))
}));

const fallbackTitle = computed(() => {
  if (loading.value) {
    return '高德底图加载中';
  }
  if (loadError.value) {
    return '高德底图加载失败';
  }
  if (!credentials.value.enabled) {
    return '未启用 BYOK';
  }
  return '未配置高德底图 Key';
});

const selectedLayer = computed<MapLayer | null>(() => {
  const selectedLayerId = mapDocumentStore.activeDocument.selectedLayerId;
  return selectedLayerId
    ? mapDocumentStore.activeDocument.layers.find((layer) => layer.id === selectedLayerId) ?? null
    : null;
});
const editingFeature = computed(() => {
  const featureId = props.geometryEditFeatureId;
  return featureId ? mapDocumentStore.activeDocument.features[featureId] ?? null : null;
});
const editingLayer = computed<MapLayer | null>(() => {
  const feature = editingFeature.value;
  return feature
    ? mapDocumentStore.activeDocument.layers.find((layer) => layer.id === feature.layerId) ?? null
    : null;
});
const editingEnabled = computed(() => Boolean(
  map.value
    && editSession.value
    && editingFeature.value
    && editingLayer.value?.role === 'work'
));

const drawingReady = computed(() => Boolean(
  map.value
    && drawingSession.value
    && props.drawingEnabled
    && !getLayerRejectReason()
));

const drawingSubmitDisabled = computed(() => Boolean(
  !map.value
    || !drawingSession.value
    || !drawingState.value.draftCount
    || Boolean(getLayerRejectReason())
));

function destroyMap() {
  editSession.value?.destroy();
  editSession.value = null;
  editState.value = createEmptyAmapEditState();
  drawingSession.value?.destroy(true);
  drawingSession.value = null;
  drawingState.value = createEmptyAmapDrawingState();
  featureAdapter?.clear();
  featureAdapter = null;
  map.value?.destroy();
  map.value = null;
}

function readLngLat(lngLat: { getLng: () => number; getLat: () => number }): LngLat {
  return [lngLat.getLng(), lngLat.getLat()];
}

function readMapBounds(currentMap: AMapMapInstance): MapBounds {
  const bounds = currentMap.getBounds();
  return {
    northEast: readLngLat(bounds.getNorthEast()),
    southWest: readLngLat(bounds.getSouthWest())
  };
}

function readMapViewport(currentMap: AMapMapInstance): MapViewport {
  return {
    center: readLngLat(currentMap.getCenter()),
    zoom: currentMap.getZoom(),
    bounds: readMapBounds(currentMap)
  };
}

function applyViewportToMap(nextViewport: MapViewport) {
  map.value?.setZoomAndCenter?.(nextViewport.zoom, nextViewport.center);
}

function syncViewportFromMap() {
  if (!map.value) {
    return;
  }
  mapDocumentStore.saveViewport(readMapViewport(map.value));
}

function syncFeatureOverlays() {
  featureAdapter?.sync(mapDocumentStore.activeDocument, {
    hiddenFeatureIds: props.geometryEditFeatureId && editState.value.ready
      ? new Set([props.geometryEditFeatureId])
      : new Set()
  });
}

function getLayerRejectReason(geometry?: AmapDrawGeometry) {
  if (!map.value || !drawingSession.value) {
    return '地图还没有加载完成。';
  }

  const result = validateDraftTargetLayer(selectedLayer.value, geometry);
  return result.ok ? '' : result.reason;
}

function startDrawing(geometry: AmapDrawGeometry) {
  const rejectReason = getLayerRejectReason(geometry);
  if (rejectReason) {
    drawingMessage.value = rejectReason;
    return;
  }

  drawingSession.value?.start(geometry);
  drawingMessage.value = `正在绘制${drawGeometryLabel(geometry)}。点单击完成，线/面双击完成。`;
}

function stopDrawing() {
  drawingSession.value?.stop();
  drawingMessage.value = drawingState.value.draftCount
    ? '已停止绘制，草稿保留。'
    : '已停止绘制。';
}

function clearDrawingDrafts() {
  drawingSession.value?.clearDrafts();
  drawingMessage.value = '已清空绘制草稿。';
}

function submitDrawingDrafts() {
  const layer = selectedLayer.value;
  const rejectReason = getLayerRejectReason();
  if (!layer || rejectReason) {
    drawingMessage.value = rejectReason || '先选择一个正式图层。';
    return;
  }

  const result = drawingSession.value?.submitDrafts({
    layerId: layer.id,
    addFeature: ({ geojson, layerId }) => mapDocumentStore.addFeature({ geojson, layerId }),
    validate: ({ draft, geojson }) => {
      const validation = validateDraftFeatureForLayer(layer, draft.geometry, geojson);
      return validation.ok ? null : validation.reason;
    }
  }) ?? { failed: 0, messages: [], submitted: 0 };

  if (result.failed) {
    drawingMessage.value = `已提交 ${result.submitted} 个草稿，保留 ${result.failed} 个异常草稿：${result.messages[0]}`;
    return;
  }

  drawingMessage.value = `已提交 ${result.submitted} 个草稿到 ${layer.name}。`;
}

function syncEditSession() {
  if (!editSession.value || !editingEnabled.value || !editingFeature.value) {
    editSession.value?.stop();
    editMessage.value = props.geometryEditFeatureId
      ? '当前要素暂不支持编辑。'
      : '选择正式图层里的要素后开始编辑。';
    syncFeatureOverlays();
    return;
  }

  const started = editSession.value.start(editingFeature.value);
  editMessage.value = started
    ? '正在编辑草稿。拖动点或折点后提交，取消会放弃本次草稿。'
    : '当前要素暂不支持编辑。';
  syncFeatureOverlays();
}

function submitGeometryEdit() {
  const feature = editingFeature.value;
  if (!feature || !editSession.value) {
    editMessage.value = '没有正在编辑的要素。';
    return;
  }

  const geojson = editSession.value.submit();
  if (!geojson) {
    editMessage.value = '编辑草稿不合法，已保留草稿。';
    return;
  }

  mapDocumentStore.updateFeatureGeometry({
    featureId: feature.id,
    geojson,
    imageResourceId: feature.imageResourceId
  });
  editMessage.value = '已提交几何编辑，并生成内部 feature.update 操作。';
}

function cancelGeometryEdit() {
  editSession.value?.stop();
  mapDocumentStore.selectFeature(null);
  editMessage.value = '已取消几何编辑。';
  syncFeatureOverlays();
}

async function initMap() {
  const token = ++loadToken;
  destroyMap();
  loadError.value = '';

  if (!readyToLoad.value) {
    loading.value = false;
    return;
  }

  loading.value = true;
  await nextTick();

  if (!container.value) {
    loading.value = false;
    return;
  }

  try {
    const AMap = await loadAmap({
      jsKey: credentials.value.jsKey,
      securityCode: credentials.value.securityCode,
      plugins: ['AMap.MouseTool', 'AMap.PolylineEditor', 'AMap.PolygonEditor']
    });

    if (token !== loadToken || !container.value) {
      return;
    }

    const initialViewport = mapDocumentStore.viewport;
    map.value = markRaw(new AMap.Map(container.value, {
      viewMode: '2D',
      zoom: initialViewport.zoom,
      center: initialViewport.center,
      resizeEnable: true
    }));

    featureAdapter = new AmapFeatureAdapter({
      AMap,
      map: map.value,
      onSelectFeature: (featureId) => {
        mapDocumentStore.selectFeature(featureId);
      }
    });
    drawingSession.value = new AmapDrawingSession({
      AMap,
      map: map.value,
      onStateChange: (state) => {
        drawingState.value = state;
      }
    });
    editSession.value = new AmapEditSession({
      AMap,
      map: map.value,
      onStateChange: (state) => {
        editState.value = state;
      }
    });
    drawingMessage.value = getLayerRejectReason() || '选择点、线或面开始绘制。';
    syncEditSession();

    map.value.addControl(new AMap.ToolBar({
      position: {
        left: CONTROL_LEFT,
        top: TOOLBAR_TOP,
        right: 'auto',
        bottom: 'auto'
      },
      direction: false,
      locate: false,
      ruler: false
    }));

    map.value.addControl(new AMap.Geolocation({
      enableHighAccuracy: true,
      timeout: 10000,
      position: {
        left: CONTROL_LEFT,
        top: GEOLOCATION_TOP,
        right: 'auto',
        bottom: 'auto'
      },
      showButton: true,
      showCircle: true,
      showMarker: true,
      panToLocation: true,
      zoomToAccuracy: true
    }));

    map.value.on('complete', syncViewportFromMap);
    map.value.on('moveend', syncViewportFromMap);
    map.value.on('zoomend', syncViewportFromMap);
    syncFeatureOverlays();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (token === loadToken) {
      loading.value = false;
    }
  }
}

watch(
  () => [
    credentials.value.enabled,
    credentials.value.jsKey,
    credentials.value.securityCode
  ],
  () => {
    void initMap();
  }
);

watch(activeDocumentKey, () => {
  editSession.value?.stop();
  drawingSession.value?.clearDrafts();
  drawingMessage.value = getLayerRejectReason() || '已切换地图，绘制草稿已清空。';
  applyViewportToMap(mapDocumentStore.viewport);
  syncFeatureOverlays();
});

watch(featureRenderKey, () => {
  syncFeatureOverlays();
});

watch(
  () => props.geometryEditFeatureId,
  () => {
    syncEditSession();
  }
);

watch(
  () => props.drawingEnabled,
  (enabled) => {
    if (!enabled) {
      drawingSession.value?.stop();
      drawingMessage.value = '绘制工具未启用。';
      return;
    }

    editSession.value?.stop();
    drawingMessage.value = getLayerRejectReason() || '选择点、线或面开始绘制。';
  }
);

onMounted(() => {
  void initMap();
});

onBeforeUnmount(() => {
  loadToken += 1;
  destroyMap();
});
</script>

<template>
  <div class="amap-base-map">
    <div ref="container" class="amap-container"></div>

    <div v-if="!map" class="map-label">
      <span>{{ fallbackTitle }}</span>
      <span>{{ statusText }}</span>
      <span v-if="loadError">检查高德 JS Key / Security Code</span>
      <span v-else>在账户弹窗保存高德底图配置后加载</span>
    </div>

    <MapDrawingDock
      :enabled="drawingEnabled"
      :message="drawingMessage"
      :ready="drawingReady"
      :state="drawingState"
      :submit-disabled="drawingSubmitDisabled"
      @start="startDrawing"
      @stop="stopDrawing"
      @clear-drafts="clearDrawingDrafts"
      @submit-drafts="submitDrawingDrafts"
    />

    <div v-if="geometryEditFeatureId" class="map-edit-dock">
      <div class="map-edit-meta">
        <b>几何编辑</b>
        <span>{{ editMessage }}</span>
      </div>
      <div class="map-edit-actions">
        <button
          class="button primary"
          type="button"
          :disabled="!editState.ready"
          @click="submitGeometryEdit"
        >
          提交编辑
        </button>
        <button class="button" type="button" @click="cancelGeometryEdit">
          取消
        </button>
      </div>
    </div>
  </div>
</template>
