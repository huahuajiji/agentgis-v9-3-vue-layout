<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue';
import {
  loadAmap,
  type AMapLngLatInstance,
  type AMapMapInstance,
  type AMapMouseToolDrawEvent,
  type AMapMouseToolInstance,
  type AMapNamespace,
  type AMapOverlayInstance
} from '../shared/amap/amapLoader';

type DrawGeometry = 'point' | 'line' | 'polygon';
type LngLat = [number, number];

type MouseToolOverlay = AMapOverlayInstance & {
  getPath?: () => AMapLngLatInstance[] | AMapLngLatInstance[][];
  getPosition?: () => AMapLngLatInstance;
};

type DraftItem = {
  createdAt: number;
  geometry: DrawGeometry;
  id: string;
  overlay: MouseToolOverlay;
};

type GeoJsonFeature = {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: LngLat | LngLat[] | LngLat[][];
  };
  properties: Record<string, unknown>;
};

type FormalFeature = {
  geojson: GeoJsonFeature;
  id: string;
};

const V9_SETTINGS_KEY = 'agentgis:v9_3:settings';
const DEFAULT_CENTER: LngLat = [108.32, 22.82];

const container = ref<HTMLElement | null>(null);
const jsKey = ref('');
const securityCode = ref('');
const loading = ref(false);
const statusText = ref('输入高德 Key 后加载地图。');
const pendingGeometry = ref<DrawGeometry | ''>('');
const map = shallowRef<AMapMapInstance | null>(null);
const AMapRef = shallowRef<AMapNamespace | null>(null);
const mouseTool = shallowRef<AMapMouseToolInstance | null>(null);
const drafts = shallowRef<DraftItem[]>([]);
const formalFeatures = shallowRef<FormalFeature[]>([]);
const formalOverlays = shallowRef<MouseToolOverlay[]>([]);
const toolCreateCount = ref(0);
const handlerBindingCount = ref(0);
const drawEventCount = ref(0);

const drawOptions: Array<{ id: DrawGeometry; label: string }> = [
  { id: 'point', label: '点' },
  { id: 'line', label: '线' },
  { id: 'polygon', label: '面' }
];

const canSubmit = computed(() => drafts.value.length > 0);
const currentToolLabel = computed(() => (pendingGeometry.value ? geometryLabel(pendingGeometry.value) : '无'));
const mouseToolDiagnostic = computed(() => (
  `tool ${toolCreateCount.value} / handler ${handlerBindingCount.value} / draw ${drawEventCount.value}`
));
const geojsonText = computed(() => {
  if (!formalFeatures.value.length) {
    return '暂无正式要素';
  }

  return JSON.stringify({
    type: 'FeatureCollection',
    features: formalFeatures.value.map((feature) => feature.geojson)
  }, null, 2);
});

restoreConfig();

function restoreConfig() {
  try {
    const saved = window.localStorage.getItem(V9_SETTINGS_KEY);
    const settings = saved ? JSON.parse(saved) : null;
    jsKey.value = settings?.amapBaseMap?.jsKey || '';
    securityCode.value = settings?.amapBaseMap?.securityCode || '';
  } catch {
    jsKey.value = '';
    securityCode.value = '';
  }
}

function saveConfig() {
  const raw = window.localStorage.getItem(V9_SETTINGS_KEY);
  const current = raw ? JSON.parse(raw) : {};
  window.localStorage.setItem(V9_SETTINGS_KEY, JSON.stringify({
    ...current,
    byokEnabled: true,
    amapBaseMap: {
      jsKey: jsKey.value.trim(),
      securityCode: securityCode.value.trim()
    }
  }));
  statusText.value = '已保存配置到 v9_3 本地设置。';
}

async function loadMap() {
  const nextJsKey = jsKey.value.trim();
  const nextSecurityCode = securityCode.value.trim();
  if (!nextJsKey || !nextSecurityCode) {
    statusText.value = '先填写高德 JS Key 和 Security Code。';
    return;
  }

  loading.value = true;
  saveConfig();
  destroyMap();
  await nextTick();

  try {
    if (!container.value) {
      statusText.value = '地图容器还没准备好。';
      return;
    }

    const AMap = await loadAmap({
      jsKey: nextJsKey,
      plugins: ['AMap.MouseTool'],
      securityCode: nextSecurityCode
    });
    AMapRef.value = markRaw(AMap);

    const nextMap = markRaw(new AMap.Map(container.value, {
      center: DEFAULT_CENTER,
      resizeEnable: true,
      viewMode: '2D',
      zoom: 13
    }));
    map.value = nextMap;
    nextMap.addControl(new AMap.ToolBar({
      position: {
        left: '24px',
        top: '24px'
      }
    }));

    mouseTool.value = createMouseTool();
    statusText.value = '地图已加载。选择点/线/面开始连续新建草稿。';
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function createMouseTool() {
  if (!AMapRef.value || !map.value) {
    return null;
  }

  const tool = markRaw(new AMapRef.value.MouseTool(map.value));
  toolCreateCount.value += 1;
  tool.on('draw', handleMouseToolDraw);
  handlerBindingCount.value += 1;
  return tool;
}

function beginMouseToolDraft(geometry: DrawGeometry) {
  if (!map.value || !AMapRef.value) {
    statusText.value = '先加载地图。';
    return;
  }

  closeMouseToolAndKeepDrafts();
  pendingGeometry.value = geometry;
  if (!mouseTool.value) {
    mouseTool.value = createMouseTool();
  }
  startMouseToolMode(geometry);
  statusText.value = `MouseTool 正在新建${geometryLabel(geometry)}草稿。点单击完成；线/面双击或右键完成。`;
}

function handleMouseToolDraw(event?: AMapMouseToolDrawEvent) {
  if (!event?.obj || !pendingGeometry.value) {
    return;
  }

  drawEventCount.value += 1;
  const geometry = pendingGeometry.value;
  const overlay = markRaw(event.obj as MouseToolOverlay);
  drafts.value = [
    ...drafts.value,
    {
      createdAt: Date.now(),
      geometry,
      id: createId('draft'),
      overlay
    }
  ];
  statusText.value = `${geometryLabel(geometry)}草稿已加入队列，MouseTool 继续保持${geometryLabel(geometry)}绘制。`;
  scheduleContinuousDraw(geometry);
}

function startMouseToolMode(geometry: DrawGeometry) {
  const tool = mouseTool.value;
  if (!tool) {
    return;
  }

  if (geometry === 'point') {
    tool.marker({
      anchor: 'center',
      cursor: 'crosshair',
      draggable: false,
      zIndex: 1200
    });
    return;
  }

  if (geometry === 'line') {
    tool.polyline({
      lineCap: 'round',
      lineJoin: 'round',
      strokeColor: '#3f6f4a',
      strokeOpacity: 0.95,
      strokeWeight: 4,
      zIndex: 1200
    });
    return;
  }

  tool.polygon({
    fillColor: '#3f6f4a',
    fillOpacity: 0.18,
    strokeColor: '#3f6f4a',
    strokeOpacity: 0.9,
    strokeWeight: 2,
    zIndex: 1200
  });
}

function scheduleContinuousDraw(geometry: DrawGeometry) {
  window.setTimeout(() => {
    if (!map.value || !mouseTool.value || pendingGeometry.value !== geometry) {
      return;
    }

    mouseTool.value.close(false);
    startMouseToolMode(geometry);
  }, 0);
}

function stopDrawing() {
  closeMouseToolAndKeepDrafts();
  pendingGeometry.value = '';
  statusText.value = drafts.value.length
    ? '已停止绘制，草稿保留在队列里。'
    : '已停止绘制。';
}

function clearDrafts() {
  mouseTool.value?.close(true);
  const overlays = drafts.value.map((draft) => draft.overlay);
  if (map.value && overlays.length) {
    map.value.remove(overlays);
  }

  drafts.value = [];
  pendingGeometry.value = '';
  statusText.value = '已清空草稿。';
}

function submitAllDrafts() {
  if (!drafts.value.length) {
    statusText.value = '当前没有可提交草稿。';
    return;
  }

  closeMouseToolAndKeepDrafts();
  const submittedDraftIds = new Set<string>();
  const nextFeatures: FormalFeature[] = [];

  drafts.value.forEach((draft, index) => {
    const feature = overlayToFeature(draft.overlay, draft.geometry);
    if (!feature) {
      return;
    }

    const id = createId('feature');
    nextFeatures.push({
      id,
      geojson: {
        ...feature,
        properties: {
          ...feature.properties,
          draftId: draft.id,
          draftOrder: index + 1,
          geometryType: draft.geometry,
          id
        }
      }
    });
    submittedDraftIds.add(draft.id);
  });

  if (!submittedDraftIds.size) {
    statusText.value = '草稿不完整，暂时不能提交。';
    return;
  }

  const submittedDrafts = drafts.value.filter((draft) => submittedDraftIds.has(draft.id));
  map.value?.remove(submittedDrafts.map((draft) => draft.overlay));
  drafts.value = drafts.value.filter((draft) => !submittedDraftIds.has(draft.id));
  formalFeatures.value = [...formalFeatures.value, ...nextFeatures];
  renderFormalOverlays();
  statusText.value = `已提交 ${submittedDraftIds.size} 个草稿并重新渲染正式 overlay。`;
}

function clearFormalFeatures() {
  if (map.value && formalOverlays.value.length) {
    map.value.remove(formalOverlays.value);
  }
  formalFeatures.value = [];
  formalOverlays.value = [];
  statusText.value = '已清空正式要素。';
}

function closeMouseToolAndKeepDrafts() {
  mouseTool.value?.close(true);
  readdDraftOverlays();
}

function readdDraftOverlays() {
  if (!map.value || !drafts.value.length) {
    return;
  }

  map.value.add(drafts.value.map((draft) => draft.overlay));
}

function renderFormalOverlays() {
  const AMap = AMapRef.value;
  const currentMap = map.value;
  if (!AMap || !currentMap) {
    return;
  }

  if (formalOverlays.value.length) {
    currentMap.remove(formalOverlays.value);
  }

  const overlays = formalFeatures.value.flatMap((feature, index) => createFormalOverlays(AMap, feature.geojson, index));
  formalOverlays.value = overlays;
  if (overlays.length) {
    currentMap.add(overlays);
  }
}

function createFormalOverlays(AMap: AMapNamespace, feature: GeoJsonFeature, index: number): MouseToolOverlay[] {
  const zIndex = 300 + index;
  if (feature.geometry.type === 'Point') {
    return [
      markRaw(new AMap.Marker({
        anchor: 'center',
        position: feature.geometry.coordinates,
        title: String(feature.properties.id || ''),
        zIndex
      }) as MouseToolOverlay)
    ];
  }

  if (feature.geometry.type === 'LineString') {
    return [
      markRaw(new AMap.Polyline({
        lineCap: 'round',
        lineJoin: 'round',
        path: feature.geometry.coordinates,
        strokeColor: '#265fb8',
        strokeOpacity: 0.95,
        strokeWeight: 4,
        zIndex
      }) as MouseToolOverlay)
    ];
  }

  return [
    markRaw(new AMap.Polygon({
      fillColor: '#265fb8',
      fillOpacity: 0.16,
      path: feature.geometry.coordinates,
      strokeColor: '#265fb8',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      zIndex
    }) as MouseToolOverlay)
  ];
}

function overlayToFeature(overlay: MouseToolOverlay, geometry: DrawGeometry): GeoJsonFeature | null {
  const convertedGeometry = overlayToGeometry(overlay, geometry);
  if (!convertedGeometry) {
    return null;
  }

  return {
    type: 'Feature',
    geometry: convertedGeometry,
    properties: {}
  };
}

function overlayToGeometry(overlay: MouseToolOverlay, geometry: DrawGeometry): GeoJsonFeature['geometry'] | null {
  if (geometry === 'point') {
    const position = overlay.getPosition?.();
    const coordinates = position ? readLngLat(position) : null;
    return coordinates
      ? {
        type: 'Point',
        coordinates
      }
      : null;
  }

  const path = readPath(overlay);
  if (geometry === 'line') {
    return path.length >= 2
      ? {
        type: 'LineString',
        coordinates: path
      }
      : null;
  }

  const ring = closeRing(path);
  return ring.length >= 4
    ? {
      type: 'Polygon',
      coordinates: [ring]
    }
    : null;
}

function readPath(overlay: MouseToolOverlay) {
  const path = overlay.getPath?.() || [];
  const first = path[0];
  const ring: AMapLngLatInstance[] = Array.isArray(first)
    ? first as AMapLngLatInstance[]
    : path as AMapLngLatInstance[];
  return ring
    .map(readLngLat)
    .filter((position): position is LngLat => Boolean(position));
}

function readLngLat(lngLat: AMapLngLatInstance): LngLat | null {
  const lng = lngLat.getLng();
  const lat = lngLat.getLat();
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function closeRing(path: LngLat[]) {
  if (!path.length) {
    return [];
  }

  const first = path[0];
  const last = path[path.length - 1];
  return first[0] === last[0] && first[1] === last[1]
    ? path
    : [...path, first];
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function geometryLabel(geometry: DrawGeometry) {
  const labels: Record<DrawGeometry, string> = {
    point: '点',
    line: '线',
    polygon: '面'
  };
  return labels[geometry];
}

function destroyMap() {
  mouseTool.value?.close(true);
  if (formalOverlays.value.length && map.value) {
    map.value.remove(formalOverlays.value);
  }
  if (drafts.value.length && map.value) {
    map.value.remove(drafts.value.map((draft) => draft.overlay));
  }
  map.value?.destroy();
  map.value = null;
  mouseTool.value = null;
  AMapRef.value = null;
  pendingGeometry.value = '';
  drafts.value = [];
  formalOverlays.value = [];
  toolCreateCount.value = 0;
  handlerBindingCount.value = 0;
  drawEventCount.value = 0;
}

onBeforeUnmount(() => {
  destroyMap();
});
</script>

<template>
  <main class="mouse-demo">
    <aside class="demo-panel">
      <header class="demo-head">
        <h1>Vue MouseTool Demo</h1>
        <p>只测试 MouseTool 新建草稿，不接编辑器、不接 Pinia、不接主绘制链路。</p>
      </header>

      <section class="demo-body">
        <section class="demo-card">
          <h2>高德配置</h2>
          <label class="field" for="vue-demo-amap-key">
            JS Key
            <input id="vue-demo-amap-key" v-model="jsKey" name="vue-demo-amap-key" autocomplete="off" placeholder="高德 JS API Key">
          </label>
          <label class="field" for="vue-demo-amap-security">
            Security Code
            <input id="vue-demo-amap-security" v-model="securityCode" name="vue-demo-amap-security" autocomplete="off" placeholder="高德 Security Code">
          </label>
          <div class="button-row">
            <button class="demo-button primary" type="button" :disabled="loading" @click="loadMap">
              {{ loading ? '加载中' : '加载地图' }}
            </button>
            <button class="demo-button" type="button" @click="saveConfig">保存配置</button>
          </div>
        </section>

        <section class="demo-card">
          <h2>新建草稿</h2>
          <div class="button-row">
            <button
              v-for="item in drawOptions"
              :key="item.id"
              class="demo-button"
              :class="{ active: pendingGeometry === item.id }"
              type="button"
              @click="beginMouseToolDraft(item.id)"
            >
              {{ item.label }}
            </button>
          </div>
          <div class="button-row">
            <button class="demo-button primary" type="button" :disabled="!canSubmit" @click="submitAllDrafts">
              提交全部 {{ drafts.length || '' }}
            </button>
            <button class="demo-button" type="button" :disabled="!pendingGeometry" @click="stopDrawing">停止绘制</button>
            <button class="demo-button" type="button" :disabled="!drafts.length && !pendingGeometry" @click="clearDrafts">清空草稿</button>
          </div>
          <button class="demo-button danger" type="button" :disabled="!formalFeatures.length" @click="clearFormalFeatures">清空正式要素</button>
        </section>

        <section class="demo-card">
          <h2>草稿状态</h2>
          <div class="kv">
            <b>当前工具</b><span>{{ currentToolLabel }}</span>
            <b>草稿数量</b><span>{{ drafts.length }}</span>
            <b>正式要素</b><span>{{ formalFeatures.length }}</span>
            <b>状态</b><span>{{ pendingGeometry ? 'MouseTool 绘制中' : '等待创建' }}</span>
            <b>诊断</b><span>{{ mouseToolDiagnostic }}</span>
          </div>
        </section>

        <section class="demo-card">
          <h2>草稿队列</h2>
          <div v-if="drafts.length" class="draft-list">
            <div v-for="(draft, index) in drafts" :key="draft.id" class="draft-row">
              <strong>#{{ index + 1 }} {{ geometryLabel(draft.geometry) }}</strong>
              <span>{{ draft.id }}</span>
            </div>
          </div>
          <p v-else class="empty">暂无草稿</p>
        </section>
      </section>
    </aside>

    <section class="demo-map-panel">
      <div ref="container" class="demo-map"></div>
      <div class="demo-status">
        <span>{{ statusText }}</span>
      </div>
    </section>

    <aside class="demo-panel">
      <header class="demo-head">
        <h2>提交结果</h2>
        <p>模拟正式入库后的 GeoJSON；提交后草稿 overlay 会移除，正式 overlay 重新渲染。</p>
      </header>
      <section class="demo-body">
        <section class="demo-card">
          <h2>正式要素</h2>
          <div class="kv">
            <b>数量</b><span>{{ formalFeatures.length }}</span>
            <b>最后提交</b><span>{{ formalFeatures.at(-1)?.id || '无' }}</span>
          </div>
        </section>
        <section class="demo-card grow">
          <h2>GeoJSON</h2>
          <pre>{{ geojsonText }}</pre>
        </section>
      </section>
    </aside>
  </main>
</template>

<style scoped>
.mouse-demo {
  width: 100vw;
  height: 100vh;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) 360px;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
  background: #f4f1e9;
  color: #2f3029;
}

.demo-panel,
.demo-map-panel {
  min-height: 0;
  overflow: hidden;
  border: 1px solid #d8d0c1;
  border-radius: 8px;
  background: #fffdf8;
  box-shadow: 0 16px 40px rgba(45, 40, 28, .12);
}

.demo-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.demo-head {
  padding: 12px 14px;
  border-bottom: 1px solid #d8d0c1;
  background: rgba(255, 255, 255, .72);
}

.demo-head h1,
.demo-head h2,
.demo-card h2 {
  margin: 0;
  font-size: 14px;
  line-height: 1.25;
}

.demo-head p {
  margin: 5px 0 0;
  color: #777164;
  font-size: 12px;
  line-height: 1.45;
}

.demo-body {
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 12px;
}

.demo-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid #d8d0c1;
  border-radius: 8px;
  background: #fff;
}

.field {
  display: grid;
  gap: 4px;
  color: #777164;
  font-size: 12px;
  font-weight: 700;
}

.field input {
  width: 100%;
  height: 34px;
  border: 1px solid #d8d0c1;
  border-radius: 6px;
  padding: 0 9px;
  color: #2f3029;
  background: #fffdf8;
  font-size: 12px;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.demo-button {
  min-height: 34px;
  border: 1px solid #d8d0c1;
  border-radius: 6px;
  background: #fff;
  color: #2f3029;
  padding: 0 11px;
  font-size: 12px;
  font-weight: 800;
}

.demo-button.primary {
  border-color: #3f6f4a;
  background: #3f6f4a;
  color: #fff;
}

.demo-button.active {
  border-color: #3f6f4a;
  background: #e6f0e5;
  color: #2d5d36;
}

.demo-button.danger {
  color: #9a3f32;
}

.kv {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 6px 8px;
  font-size: 12px;
  line-height: 1.4;
}

.kv b {
  color: #777164;
}

.draft-list {
  display: grid;
  gap: 6px;
  max-height: 180px;
  overflow: auto;
}

.draft-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  padding: 7px;
  border-radius: 6px;
  background: #f7f4ed;
  font-size: 12px;
}

.draft-row span {
  min-width: 0;
  overflow: hidden;
  color: #777164;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  margin: 0;
  color: #777164;
  font-size: 12px;
}

.demo-map-panel {
  position: relative;
}

.demo-map {
  width: 100%;
  height: 100%;
}

.demo-status {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 16px;
  z-index: 2;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.demo-status span {
  max-width: min(720px, 100%);
  padding: 8px 12px;
  border: 1px solid #d8d0c1;
  border-radius: 6px;
  background: rgba(255, 253, 248, .94);
  box-shadow: 0 10px 30px rgba(45, 40, 28, .14);
  color: #2f3029;
  font-size: 12px;
  line-height: 1.4;
}

pre {
  min-height: 0;
  max-height: calc(100vh - 210px);
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: #3b3b33;
  font: 12px/1.5 "Cascadia Code", Consolas, monospace;
}
</style>
