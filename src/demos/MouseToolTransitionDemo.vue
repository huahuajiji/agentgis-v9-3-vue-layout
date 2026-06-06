<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { Feature as GeoJsonFeature } from 'geojson';
import {
  loadAmap,
  type AMapLngLatInstance,
  type AMapMapInstance,
  type AMapMouseToolDrawEvent,
  type AMapMouseToolInstance,
  type AMapNamespace,
  type AMapOverlayInstance
} from '../shared/amap/amapLoader';
import { AmapFeatureAdapter } from '../shared/map/amapFeatureAdapter';
import { useMapDocumentStore, type LayerGeometryType } from '../stores/mapDocumentStore';

type DrawGeometry = 'point' | 'line' | 'polygon';
type StageId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
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

type FormalFeature = {
  geojson: GeoJsonFeature;
  id: string;
};

type ParentDraftState = {
  active: boolean;
  drawing: boolean;
  draftCount: number;
  geometry: DrawGeometry | '';
  message: string;
};

const STAGES: Array<{
  adds: string;
  id: StageId;
  label: string;
  watch: string;
}> = [
  { id: 0, label: '0 纯 demo', adds: '只保留 MouseTool + 本地草稿队列', watch: '高德本身是否稳定' },
  { id: 1, label: '1 父子状态', adds: '加入 draft 状态回传模拟', watch: 'emit/props 是否导致重复启动' },
  { id: 2, label: '2 模式 watch', adds: '加入编辑/绘制模式切换 watch', watch: '模式切换是否打断旧会话' },
  { id: 3, label: '3 Pinia addFeature', adds: '提交草稿时写入 mapDocumentStore.addFeature', watch: '新增要素 action/operation 是否重复' },
  { id: 4, label: '4 手动 adapter', adds: '提交后手动 AmapFeatureAdapter.sync', watch: '正式 overlay 是否和草稿 overlay 冲突' },
  { id: 5, label: '5 自动 store watch', adds: '加入类似正式项目的 featureRenderKey watch', watch: 'store 自动同步是否造成重复渲染' },
  { id: 6, label: '6 同函数监听', adds: '连续绘制重启时重复绑定同一个 draw handler', watch: '同一个函数引用是否会翻倍' },
  { id: 7, label: '7 匿名监听', adds: '连续绘制重启时重复绑定匿名 draw handler', watch: '匿名函数残留是否会翻倍' },
  { id: 8, label: '8 MouseTool 泄漏', adds: '连续绘制时不断创建新 MouseTool，不关闭旧实例', watch: '多个实例是否一起接住点击' },
  { id: 9, label: '9 父组件回放', adds: '模拟 ref/defineExpose 链路重复下发 startDrawing', watch: '父子控制链是否重复启动绘制' },
  { id: 10, label: '10 持久化回声', adds: '提交后读取 localStorage 并强制重 sync', watch: '保存/恢复是否制造重复渲染' },
  { id: 11, label: '11 撤回版 Session', adds: '模拟刚刚撤回的 session/start/stop/submit 链路', watch: '那套计划本身是否会翻倍' },
  { id: 12, label: '12 双 Session', adds: '模拟同一张 map 上两个 session 同时启动', watch: '正式页若重复挂载 session 会怎样' }
];

const DRAW_OPTIONS: Array<{ id: DrawGeometry; label: string }> = [
  { id: 'point', label: '点' },
  { id: 'line', label: '线' },
  { id: 'polygon', label: '面' }
];

const V9_SETTINGS_KEY = 'agentgis:v9_3:settings';
const MAP_DOCUMENT_STORAGE_KEY = 'agentgis:v9_3:map-document-state';
const DEFAULT_CENTER: LngLat = [108.32, 22.82];
const DIAGNOSTIC_LAYER_PREFIX = 'diagnostic-mousetool';

const mapDocumentStore = useMapDocumentStore();
const selectedStage = ref<StageId>(0);
const container = ref<HTMLElement | null>(null);
const jsKey = ref('');
const securityCode = ref('');
const loading = ref(false);
const statusText = ref('输入高德 Key 后加载地图。');
const mode = ref<'browse' | 'edit'>('edit');
const tool = ref<'select' | 'draw'>('draw');
const pendingGeometry = ref<DrawGeometry | ''>('');
const map = shallowRef<AMapMapInstance | null>(null);
const AMapRef = shallowRef<AMapNamespace | null>(null);
const mouseTool = shallowRef<AMapMouseToolInstance | null>(null);
const secondaryMouseTool = shallowRef<AMapMouseToolInstance | null>(null);
const drafts = shallowRef<DraftItem[]>([]);
const localFeatures = shallowRef<FormalFeature[]>([]);
const localFormalOverlays = shallowRef<MouseToolOverlay[]>([]);
const submittedFeatureIds = shallowRef<string[]>([]);
const logs = shallowRef<string[]>([]);
const parentDraftState = ref<ParentDraftState>({
  active: false,
  drawing: false,
  draftCount: 0,
  geometry: '',
  message: '未接入父子状态'
});

let featureAdapter: AmapFeatureAdapter | null = null;
const drawEventCount = ref(0);
const handlerBindingCount = ref(0);
const startModeCount = ref(0);
const closeCount = ref(0);
const parentEchoCount = ref(0);
const storeSubmitCount = ref(0);
const adapterSyncCount = ref(0);
const leakedMouseToolCount = ref(0);
const parentBridgeReplayCount = ref(0);
const persistenceEchoCount = ref(0);
const storedDiagnosticFeatureCount = ref(0);
const doubleSessionCount = ref(0);
const withdrawnSubmitCount = ref(0);

let leakedMouseTools: AMapMouseToolInstance[] = [];

const stage = computed(() => STAGES.find((item) => item.id === selectedStage.value) ?? STAGES[0]);
const usesParentFeedback = computed(() => selectedStage.value >= 1);
const usesModeWatch = computed(() => selectedStage.value >= 2);
const usesPiniaSubmit = computed(() => selectedStage.value >= 3 || selectedStage.value === 11);
const usesAdapter = computed(() => selectedStage.value >= 4 || selectedStage.value === 11);
const usesAutoStoreSync = computed(() => selectedStage.value >= 5 && selectedStage.value !== 11);
const usesRepeatedHandler = computed(() => selectedStage.value === 6);
const usesAnonymousHandler = computed(() => selectedStage.value === 7);
const usesLeakedMouseTools = computed(() => selectedStage.value === 8);
const usesExposeBridge = computed(() => selectedStage.value === 9);
const usesPersistenceStress = computed(() => selectedStage.value === 10);
const usesWithdrawnSessionPlan = computed(() => selectedStage.value === 11);
const usesDoubleSession = computed(() => selectedStage.value === 12);
const isDrawingEnabled = computed(() => !usesModeWatch.value || (mode.value === 'edit' && tool.value === 'draw'));
const currentToolLabel = computed(() => (pendingGeometry.value ? geometryLabel(pendingGeometry.value) : '无'));
const activeMouseToolCount = computed(() => {
  if (usesLeakedMouseTools.value) {
    return leakedMouseToolCount.value;
  }
  if (usesDoubleSession.value) {
    return doubleSessionCount.value;
  }
  return mouseTool.value ? 1 : 0;
});
const mouseToolDiagnostic = computed(() => (
  `tool ${activeMouseToolCount.value} / handler ${handlerBindingCount.value} / draw ${drawEventCount.value}`
));
const featureRenderKey = computed(() => JSON.stringify({
  activeRef: mapDocumentStore.activeDocumentRef,
  layers: mapDocumentStore.activeDocument.layers.map((layer) => ({
    featureIds: layer.featureIds,
    id: layer.id,
    order: layer.order,
    style: layer.style,
    visible: layer.visible
  })),
  features: Object.values(mapDocumentStore.activeDocument.features).map((feature) => ({
    geojson: feature.geojson,
    id: feature.id,
    imageResourceId: feature.imageResourceId,
    layerId: feature.layerId
  }))
}));
const storeOperationSummary = computed(() => ({
  redo: mapDocumentStore.activeDocument.edit.redoOperations.length,
  working: mapDocumentStore.activeDocument.edit.workingOperations.length
}));
const geojsonText = computed(() => {
  if (usesPiniaSubmit.value) {
    const features = submittedFeatureIds.value
      .map((featureId) => mapDocumentStore.activeDocument.features[featureId])
      .filter(Boolean)
      .map((feature) => feature.geojson);

    return features.length
      ? JSON.stringify({ type: 'FeatureCollection', features }, null, 2)
      : '本阶段还没有提交到 Pinia 的诊断要素';
  }

  return localFeatures.value.length
    ? JSON.stringify({
      type: 'FeatureCollection',
      features: localFeatures.value.map((feature) => feature.geojson)
    }, null, 2)
    : '本阶段还没有本地正式要素';
});

restoreConfig();

watch(selectedStage, (nextStage) => {
  resetRunState();
  appendLog(`切换到阶段 ${nextStage}：${stage.value.adds}`);
  if (usesAdapter.value) {
    ensureFeatureAdapter();
    syncFeatureAdapter('切换阶段');
  } else {
    featureAdapter?.clear();
  }
});

watch(
  () => [mode.value, tool.value, selectedStage.value] as const,
  () => {
    if (!usesModeWatch.value) {
      return;
    }

    if (!isDrawingEnabled.value && pendingGeometry.value) {
      closeMouseToolAndKeepDrafts();
      pendingGeometry.value = '';
      emitParentDraftState('模式 watch 停止绘制');
      appendLog('模式/工具离开编辑绘制，已关闭 MouseTool，草稿保留。');
    }
  }
);

watch(featureRenderKey, () => {
  if (!usesAutoStoreSync.value) {
    return;
  }

  syncFeatureAdapter('featureRenderKey watch');
});

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
    amapBaseMap: {
      jsKey: jsKey.value.trim(),
      securityCode: securityCode.value.trim()
    },
    byokEnabled: true
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
    if (usesAdapter.value) {
      ensureFeatureAdapter();
    }

    statusText.value = '地图已加载。按阶段选择点/线/面开始测试。';
    appendLog('地图加载完成，MouseTool 已创建并绑定一次 draw handler。');
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
  bindDrawHandler(tool, '创建 MouseTool');
  return tool;
}

function bindDrawHandler(tool: AMapMouseToolInstance, reason: string) {
  handlerBindingCount.value += 1;
  tool.on('draw', handleMouseToolDraw);
  appendLog(`绑定 draw handler #${handlerBindingCount.value}：${reason}`);
}

function bindAnonymousDrawHandler(tool: AMapMouseToolInstance, reason: string) {
  handlerBindingCount.value += 1;
  tool.on('draw', (event) => {
    handleMouseToolDraw(event);
  });
  appendLog(`绑定匿名 draw handler #${handlerBindingCount.value}：${reason}`);
}

function createSecondaryMouseTool() {
  if (!AMapRef.value || !map.value) {
    return null;
  }

  const tool = markRaw(new AMapRef.value.MouseTool(map.value));
  bindAnonymousDrawHandler(tool, '阶段 12：第二个 session 的 MouseTool');
  secondaryMouseTool.value = tool;
  doubleSessionCount.value = 2;
  appendLog('阶段 12：第二个 MouseTool session 已创建。');
  return tool;
}

function beginMouseToolDraft(geometry: DrawGeometry) {
  if (!map.value || !AMapRef.value) {
    statusText.value = '先加载地图。';
    return;
  }
  if (!isDrawingEnabled.value) {
    statusText.value = '当前不是编辑/绘制模式，阶段 2 以后会拒绝启动绘制。';
    appendLog('绘制被拒绝：模式/工具不是编辑绘制。');
    return;
  }

  if (usesLeakedMouseTools.value) {
    beginLeakedMouseToolDraft(geometry);
    return;
  }

  if (usesDoubleSession.value) {
    beginDoubleSessionDraft(geometry);
    return;
  }

  closeMouseToolAndKeepDrafts();
  pendingGeometry.value = geometry;
  if (!mouseTool.value) {
    mouseTool.value = createMouseTool();
  }
  startMouseToolMode(geometry);
  emitParentDraftState(`开始绘制${geometryLabel(geometry)}`);
  statusText.value = `MouseTool 正在新建${geometryLabel(geometry)}草稿。点单击完成；线/面双击或右键完成。`;
}

function beginLeakedMouseToolDraft(geometry: DrawGeometry) {
  pendingGeometry.value = geometry;
  const leakedTool = createLeakedMouseTool('阶段 8：按钮启动新实例');
  if (!leakedTool) {
    return;
  }

  mouseTool.value = leakedTool;
  startMouseToolMode(geometry, leakedTool);
  emitParentDraftState(`开始绘制${geometryLabel(geometry)}`);
  statusText.value = `阶段 8：新建了第 ${leakedMouseToolCount.value} 个 MouseTool，旧实例未关闭。`;
}

function beginDoubleSessionDraft(geometry: DrawGeometry) {
  closeMouseToolAndKeepDrafts();
  secondaryMouseTool.value?.close(true);
  pendingGeometry.value = geometry;

  if (!mouseTool.value) {
    mouseTool.value = createMouseTool();
  }
  const secondaryTool = secondaryMouseTool.value ?? createSecondaryMouseTool();

  startMouseToolMode(geometry, mouseTool.value);
  startMouseToolMode(geometry, secondaryTool);
  emitParentDraftState(`双 Session 开始绘制${geometryLabel(geometry)}`);
  statusText.value = '阶段 12：同一张 map 上两个 MouseTool 同时启动。';
}

function createLeakedMouseTool(reason: string) {
  if (!AMapRef.value || !map.value) {
    return null;
  }

  const tool = markRaw(new AMapRef.value.MouseTool(map.value));
  bindAnonymousDrawHandler(tool, reason);
  leakedMouseTools = [...leakedMouseTools, tool];
  leakedMouseToolCount.value = leakedMouseTools.length;
  appendLog(`保留泄漏 MouseTool 实例 #${leakedMouseToolCount.value}`);
  return tool;
}

function handleMouseToolDraw(event?: AMapMouseToolDrawEvent) {
  if (!event?.obj || !pendingGeometry.value) {
    appendLog('收到空 draw 事件，已忽略。');
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
  emitParentDraftState(`${geometryLabel(geometry)}草稿进入队列`);
  appendLog(`draw #${drawEventCount.value}：新增一个${geometryLabel(geometry)}草稿，当前草稿 ${drafts.value.length} 个。`);
  scheduleContinuousDraw(geometry);
}

function startMouseToolMode(geometry: DrawGeometry, targetTool: AMapMouseToolInstance | null = mouseTool.value) {
  const toolInstance = targetTool;
  if (!toolInstance) {
    return;
  }

  startModeCount.value += 1;
  appendLog(`启动 MouseTool ${geometryLabel(geometry)}模式 #${startModeCount.value}`);

  if (geometry === 'point') {
    toolInstance.marker({
      anchor: 'center',
      cursor: 'crosshair',
      draggable: false,
      zIndex: 1200
    });
    return;
  }

  if (geometry === 'line') {
    toolInstance.polyline({
      lineCap: 'round',
      lineJoin: 'round',
      strokeColor: '#3f6f4a',
      strokeOpacity: 0.95,
      strokeWeight: 4,
      zIndex: 1200
    });
    return;
  }

  toolInstance.polygon({
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

    if (usesLeakedMouseTools.value) {
      const leakedTool = createLeakedMouseTool('阶段 8：连续绘制后追加实例');
      if (leakedTool) {
        mouseTool.value = leakedTool;
        startMouseToolMode(geometry, leakedTool);
      }
      return;
    }

    if (usesDoubleSession.value) {
      mouseTool.value.close(false);
      secondaryMouseTool.value?.close(false);
      closeCount.value += 1;
      startMouseToolMode(geometry, mouseTool.value);
      startMouseToolMode(geometry, secondaryMouseTool.value);
      return;
    }

    mouseTool.value.close(false);
    closeCount.value += 1;
    if (usesRepeatedHandler.value) {
      bindDrawHandler(mouseTool.value, '阶段 6：连续绘制重启时重复绑定同函数');
    }
    if (usesAnonymousHandler.value) {
      bindAnonymousDrawHandler(mouseTool.value, '阶段 7：连续绘制重启时重复绑定匿名函数');
    }
    startMouseToolMode(geometry);
  }, 0);
}

function submitAllDrafts() {
  if (!drafts.value.length) {
    statusText.value = '当前没有可提交草稿。';
    return;
  }

  if (usesWithdrawnSessionPlan.value) {
    submitWithdrawnSessionDrafts();
    return;
  }

  closeMouseToolAndKeepDrafts();
  const submittedDraftIds = new Set<string>();

  drafts.value.forEach((draft, index) => {
    const feature = overlayToFeature(draft.overlay, draft.geometry);
    if (!feature) {
      appendLog(`草稿 ${draft.id} 几何不完整，跳过。`);
      return;
    }

    if (usesPiniaSubmit.value) {
      submitFeatureToPinia(feature, draft, index);
    } else {
      submitFeatureLocally(feature, draft, index);
    }
    submittedDraftIds.add(draft.id);
  });

  if (!submittedDraftIds.size) {
    statusText.value = '草稿不完整，暂时不能提交。';
    return;
  }

  const submittedDrafts = drafts.value.filter((draft) => submittedDraftIds.has(draft.id));
  map.value?.remove(submittedDrafts.map((draft) => draft.overlay));
  drafts.value = drafts.value.filter((draft) => !submittedDraftIds.has(draft.id));
  emitParentDraftState(`提交 ${submittedDraftIds.size} 个草稿`);

  if (usesPiniaSubmit.value) {
    if (usesAdapter.value && !usesAutoStoreSync.value) {
      syncFeatureAdapter('提交草稿后手动 sync');
    }
    if (usesPersistenceStress.value) {
      runPersistenceEcho(`提交 ${submittedDraftIds.size} 个草稿后`);
    }
    statusText.value = `已提交 ${submittedDraftIds.size} 个草稿到 Pinia。`;
    return;
  }

  renderLocalFormalOverlays();
  statusText.value = `已提交 ${submittedDraftIds.size} 个草稿到本地正式 overlay。`;
}

function submitWithdrawnSessionDrafts() {
  closeMouseToolAndKeepDrafts();
  pendingGeometry.value = '';
  const submittedDraftIds = new Set<string>();
  const skippedMessages: string[] = [];

  drafts.value.forEach((draft, index) => {
    const feature = overlayToFeature(draft.overlay, draft.geometry);
    if (!feature) {
      skippedMessages.push(`草稿 ${draft.id} 几何不完整`);
      return;
    }

    const layerId = ensureDiagnosticLayer(draft.geometry);
    if (!layerId) {
      skippedMessages.push(`没有可用${geometryLabel(draft.geometry)}图层`);
      return;
    }

    const featureId = createId('withdrawn-feature');
    try {
      mapDocumentStore.addFeature({
        geojson: withDiagnosticProperties(feature, draft, index, featureId),
        id: featureId,
        layerId
      });
      submittedFeatureIds.value = [...submittedFeatureIds.value, featureId];
      submittedDraftIds.add(draft.id);
      storeSubmitCount.value += 1;
      withdrawnSubmitCount.value += 1;
      appendLog(`撤回版 submit #${withdrawnSubmitCount.value}：${featureId}`);
    } catch (error) {
      skippedMessages.push(error instanceof Error ? error.message : String(error));
    }
  });

  if (!submittedDraftIds.size) {
    statusText.value = skippedMessages[0] || '撤回版链路：没有草稿成功提交。';
    appendLog(statusText.value);
    return;
  }

  const submittedDrafts = drafts.value.filter((draft) => submittedDraftIds.has(draft.id));
  map.value?.remove(submittedDrafts.map((draft) => draft.overlay));
  drafts.value = drafts.value.filter((draft) => !submittedDraftIds.has(draft.id));
  syncFeatureAdapter('阶段 11：撤回版 submit 后手动 sync');
  statusText.value = skippedMessages.length
    ? `撤回版链路已提交 ${submittedDraftIds.size} 个，跳过 ${skippedMessages.length} 个`
    : `撤回版链路已提交 ${submittedDraftIds.size} 个`;
  appendLog(statusText.value);
}

function submitFeatureLocally(feature: GeoJsonFeature, draft: DraftItem, index: number) {
  const id = createId('local-feature');
  localFeatures.value = [
    ...localFeatures.value,
    {
      id,
      geojson: withDiagnosticProperties(feature, draft, index, id)
    }
  ];
}

function submitFeatureToPinia(feature: GeoJsonFeature, draft: DraftItem, index: number) {
  const layerId = ensureDiagnosticLayer(draft.geometry);
  if (!layerId) {
    appendLog(`没有可用图层，跳过 ${draft.id}`);
    return;
  }

  const featureId = createId('diagnostic-feature');
  mapDocumentStore.addFeature({
    id: featureId,
    geojson: withDiagnosticProperties(feature, draft, index, featureId),
    layerId
  });
  submittedFeatureIds.value = [...submittedFeatureIds.value, featureId];
  storeSubmitCount.value += 1;
  appendLog(`Pinia addFeature #${storeSubmitCount.value}：${featureId}`);
}

function ensureDiagnosticLayer(geometry: DrawGeometry) {
  const geometryType = toLayerGeometryType(geometry);
  const layerId = `${DIAGNOSTIC_LAYER_PREFIX}-${geometryType}`;
  const existingLayer = mapDocumentStore.activeDocument.layers.find((layer) => layer.id === layerId);

  if (existingLayer) {
    mapDocumentStore.selectLayer(layerId);
    return layerId;
  }

  try {
    mapDocumentStore.createLayer({
      geometryType,
      id: layerId,
      name: `MouseTool 诊断${geometryLabel(geometry)}图层`,
      role: 'work',
      style: {
        color: geometry === 'point' ? '#2f6f8f' : geometry === 'line' ? '#3f6f4a' : '#8a5a2b'
      },
      visible: true
    });
    appendLog(`创建诊断图层：${layerId}`);
    return layerId;
  } catch (error) {
    appendLog(error instanceof Error ? error.message : String(error));
    return null;
  }
}

function ensureFeatureAdapter() {
  if (featureAdapter || !AMapRef.value || !map.value) {
    return;
  }

  featureAdapter = new AmapFeatureAdapter({
    AMap: AMapRef.value,
    map: map.value,
    onSelectFeature: (featureId) => {
      mapDocumentStore.selectFeature(featureId);
      appendLog(`正式 overlay 选中 feature：${featureId}`);
    }
  });
}

function syncFeatureAdapter(reason: string) {
  if (!usesAdapter.value) {
    return;
  }

  ensureFeatureAdapter();
  featureAdapter?.sync(mapDocumentStore.activeDocument);
  adapterSyncCount.value += 1;
  appendLog(`AmapFeatureAdapter.sync #${adapterSyncCount.value}：${reason}`);
}

function runPersistenceEcho(reason: string) {
  persistenceEchoCount.value += 1;

  try {
    const raw = window.localStorage.getItem(MAP_DOCUMENT_STORAGE_KEY);
    const savedState = raw ? JSON.parse(raw) : null;
    const activeDocument = savedState?.activeDocumentRef?.kind === 'saved'
      ? savedState?.documentsById?.[savedState.activeDocumentRef.id]
      : savedState?.draftDocument;
    const features = activeDocument?.features && typeof activeDocument.features === 'object'
      ? activeDocument.features
      : {};

    storedDiagnosticFeatureCount.value = submittedFeatureIds.value.filter((featureId) => Boolean(features[featureId])).length;
    appendLog(
      `持久化回声 #${persistenceEchoCount.value}：${reason}，本次诊断 feature 在 localStorage 中 ${storedDiagnosticFeatureCount.value}/${submittedFeatureIds.value.length}`
    );
  } catch (error) {
    appendLog(`持久化读取失败：${error instanceof Error ? error.message : String(error)}`);
  }

  featureAdapter?.clear();
  syncFeatureAdapter('阶段 10：读取 localStorage 后强制重 sync');
}

function stopDrawing() {
  if (usesLeakedMouseTools.value) {
    closeAllMouseTools(true);
    readdDraftOverlays();
  } else {
    closeMouseToolAndKeepDrafts();
  }
  pendingGeometry.value = '';
  emitParentDraftState('停止绘制，草稿保留');
  statusText.value = drafts.value.length ? '已停止绘制，草稿保留。' : '已停止绘制。';
}

function clearDrafts() {
  closeAllMouseTools(true);
  if (map.value && drafts.value.length) {
    map.value.remove(drafts.value.map((draft) => draft.overlay));
  }
  drafts.value = [];
  pendingGeometry.value = '';
  emitParentDraftState('清空草稿');
  statusText.value = '已清空草稿。';
}

function clearLocalFormalFeatures() {
  if (map.value && localFormalOverlays.value.length) {
    map.value.remove(localFormalOverlays.value);
  }
  localFeatures.value = [];
  localFormalOverlays.value = [];
  statusText.value = '已清空本地正式要素。';
}

function clearSubmittedStoreFeatures() {
  submittedFeatureIds.value.forEach((featureId) => {
    if (mapDocumentStore.activeDocument.features[featureId]) {
      mapDocumentStore.deleteFeature(featureId);
    }
  });
  submittedFeatureIds.value = [];
  syncFeatureAdapter('清空本次 Pinia 诊断要素');
  appendLog('已清空本次提交到 Pinia 的诊断要素。');
}

function resetRunState() {
  closeAllMouseTools(true);
  if (map.value && drafts.value.length) {
    map.value.remove(drafts.value.map((draft) => draft.overlay));
  }
  drafts.value = [];
  pendingGeometry.value = '';
  clearLocalFormalFeatures();
  drawEventCount.value = 0;
  handlerBindingCount.value = 0;
  startModeCount.value = 0;
  closeCount.value = 0;
  parentEchoCount.value = 0;
  storeSubmitCount.value = 0;
  adapterSyncCount.value = 0;
  leakedMouseToolCount.value = 0;
  parentBridgeReplayCount.value = 0;
  persistenceEchoCount.value = 0;
  storedDiagnosticFeatureCount.value = 0;
  doubleSessionCount.value = 0;
  withdrawnSubmitCount.value = 0;
  logs.value = [];
  parentDraftState.value = {
    active: false,
    drawing: false,
    draftCount: 0,
    geometry: '',
    message: usesParentFeedback.value ? '等待绘制状态回传' : '未接入父子状态'
  };
  mouseTool.value = createMouseTool();
}

function closeMouseToolAndKeepDrafts() {
  mouseTool.value?.close(true);
  closeCount.value += 1;
  readdDraftOverlays();
}

function closeAllMouseTools(clearOverlays: boolean) {
  mouseTool.value?.close(clearOverlays);
  secondaryMouseTool.value?.close(clearOverlays);
  secondaryMouseTool.value = null;
  leakedMouseTools.forEach((tool) => {
    tool.close(clearOverlays);
  });
  leakedMouseTools = [];
  leakedMouseToolCount.value = 0;
  doubleSessionCount.value = 0;
  closeCount.value += 1;
}

function readdDraftOverlays() {
  if (!map.value || !drafts.value.length) {
    return;
  }

  map.value.add(drafts.value.map((draft) => draft.overlay));
}

function renderLocalFormalOverlays() {
  const AMap = AMapRef.value;
  const currentMap = map.value;
  if (!AMap || !currentMap) {
    return;
  }

  if (localFormalOverlays.value.length) {
    currentMap.remove(localFormalOverlays.value);
  }

  const overlays = localFeatures.value.flatMap((feature, index) => createFormalOverlays(AMap, feature.geojson, index));
  localFormalOverlays.value = overlays;
  if (overlays.length) {
    currentMap.add(overlays);
  }
}

function createFormalOverlays(AMap: AMapNamespace, feature: GeoJsonFeature, index: number): MouseToolOverlay[] {
  const zIndex = 900 + index;
  if (feature.geometry.type === 'Point') {
    return [
      new AMap.Marker({
        anchor: 'center',
        position: feature.geometry.coordinates,
        title: String(feature.properties?.name ?? feature.properties?.id ?? 'local-feature'),
        zIndex
      }) as MouseToolOverlay
    ];
  }

  if (feature.geometry.type === 'LineString') {
    return [
      new AMap.Polyline({
        lineCap: 'round',
        lineJoin: 'round',
        path: feature.geometry.coordinates,
        strokeColor: '#3f6f4a',
        strokeOpacity: 0.9,
        strokeWeight: 4,
        zIndex
      }) as MouseToolOverlay
    ];
  }

  if (feature.geometry.type === 'Polygon') {
    return [
      new AMap.Polygon({
        fillColor: '#3f6f4a',
        fillOpacity: 0.15,
        path: feature.geometry.coordinates,
        strokeColor: '#3f6f4a',
        strokeOpacity: 0.82,
        strokeWeight: 2,
        zIndex
      }) as MouseToolOverlay
    ];
  }

  return [];
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
  return first[0] === last[0] && first[1] === last[1] ? path : [...path, first];
}

function withDiagnosticProperties(feature: GeoJsonFeature, draft: DraftItem, index: number, id: string): GeoJsonFeature {
  return {
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      diagnosticStage: selectedStage.value,
      draftId: draft.id,
      draftOrder: index + 1,
      geometryType: draft.geometry,
      id,
      name: `诊断${geometryLabel(draft.geometry)} ${index + 1}`
    }
  };
}

function emitParentDraftState(message: string) {
  if (!usesParentFeedback.value) {
    return;
  }

  parentEchoCount.value += 1;
  parentDraftState.value = {
    active: Boolean(pendingGeometry.value || drafts.value.length),
    drawing: Boolean(pendingGeometry.value),
    draftCount: drafts.value.length,
    geometry: pendingGeometry.value,
    message
  };

  if (usesExposeBridge.value && message.startsWith('开始绘制') && pendingGeometry.value) {
    const geometry = pendingGeometry.value;
    void nextTick(() => {
      if (!usesExposeBridge.value || pendingGeometry.value !== geometry || !mouseTool.value) {
        return;
      }

      parentBridgeReplayCount.value += 1;
      appendLog(`父组件 ref/expose 回放 startDrawing #${parentBridgeReplayCount.value}`);
      startMouseToolMode(geometry);
    });
  }
}

function setMode(nextMode: 'browse' | 'edit') {
  mode.value = nextMode;
}

function setTool(nextTool: 'select' | 'draw') {
  tool.value = nextTool;
}

function appendLog(message: string) {
  const time = new Date().toLocaleTimeString();
  logs.value = [`${time} ${message}`, ...logs.value].slice(0, 80);
}

function toLayerGeometryType(geometry: DrawGeometry): LayerGeometryType {
  if (geometry === 'point') {
    return 'point';
  }
  if (geometry === 'line') {
    return 'line';
  }
  return 'polygon';
}

function geometryLabel(geometry: DrawGeometry) {
  const labels: Record<DrawGeometry, string> = {
    line: '线',
    point: '点',
    polygon: '面'
  };
  return labels[geometry];
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function destroyMap() {
  closeAllMouseTools(true);
  featureAdapter?.clear();
  featureAdapter = null;
  if (map.value && drafts.value.length) {
    map.value.remove(drafts.value.map((draft) => draft.overlay));
  }
  if (map.value && localFormalOverlays.value.length) {
    map.value.remove(localFormalOverlays.value);
  }
  map.value?.destroy();
  map.value = null;
  mouseTool.value = null;
  AMapRef.value = null;
  drafts.value = [];
  localFeatures.value = [];
  localFormalOverlays.value = [];
  pendingGeometry.value = '';
}

onBeforeUnmount(() => {
  destroyMap();
});
</script>

<template>
  <main class="transition-demo">
    <header class="demo-header">
      <div>
        <p class="eyebrow">MouseTool 变迁诊断</p>
        <h1>从纯 demo 到正式 Vue 链路</h1>
      </div>
      <div class="config-row">
        <input v-model="jsKey" class="config-input" placeholder="高德 JS Key" type="password">
        <input v-model="securityCode" class="config-input" placeholder="Security Code" type="password">
        <button class="demo-button primary" type="button" :disabled="loading" @click="loadMap">
          {{ loading ? '加载中' : '加载地图' }}
        </button>
        <button class="demo-button" type="button" @click="saveConfig">保存配置</button>
      </div>
    </header>

    <section class="stage-table">
      <button
        v-for="item in STAGES"
        :key="item.id"
        class="stage-row"
        :class="{ active: selectedStage === item.id }"
        type="button"
        @click="selectedStage = item.id"
      >
        <b>{{ item.label }}</b>
        <span>{{ item.adds }}</span>
        <em>{{ item.watch }}</em>
      </button>
    </section>

    <section class="demo-shell">
      <aside class="demo-panel">
        <div class="panel-section">
          <p class="section-title">当前阶段</p>
          <h2>{{ stage.label }}</h2>
          <p>{{ stage.adds }}</p>
          <p class="muted">观察：{{ stage.watch }}</p>
        </div>

        <div class="panel-section">
          <p class="section-title">模式模拟</p>
          <div class="segmented">
            <button :class="{ active: mode === 'edit' }" type="button" @click="setMode('edit')">编辑</button>
            <button :class="{ active: mode === 'browse' }" type="button" @click="setMode('browse')">浏览</button>
          </div>
          <div class="segmented">
            <button :class="{ active: tool === 'draw' }" type="button" @click="setTool('draw')">绘制</button>
            <button :class="{ active: tool === 'select' }" type="button" @click="setTool('select')">选择</button>
          </div>
          <p class="muted">阶段 2 以后，离开编辑/绘制会触发 stop。</p>
        </div>

        <div class="panel-section">
          <p class="section-title">绘制</p>
          <div class="draw-buttons">
            <button
              v-for="item in DRAW_OPTIONS"
              :key="item.id"
              class="demo-button"
              :class="{ active: pendingGeometry === item.id }"
              type="button"
              @click="beginMouseToolDraft(item.id)"
            >
              {{ item.label }}
            </button>
          </div>
          <div class="action-grid">
            <button class="demo-button primary" type="button" :disabled="!drafts.length" @click="submitAllDrafts">
              提交草稿 {{ drafts.length || '' }}
            </button>
            <button class="demo-button" type="button" :disabled="!pendingGeometry" @click="stopDrawing">停止</button>
            <button class="demo-button" type="button" :disabled="!drafts.length && !pendingGeometry" @click="clearDrafts">清空草稿</button>
            <button class="demo-button" type="button" :disabled="!localFeatures.length" @click="clearLocalFormalFeatures">清空本地</button>
            <button class="demo-button" type="button" :disabled="!submittedFeatureIds.length" @click="clearSubmittedStoreFeatures">清空 Pinia</button>
            <button class="demo-button" type="button" @click="resetRunState">重置计数</button>
          </div>
        </div>

        <div class="panel-section state-grid">
          <b>当前工具</b><span>{{ currentToolLabel }}</span>
          <b>诊断</b><span>{{ mouseToolDiagnostic }}</span>
          <b>draw 事件</b><span>{{ drawEventCount }}</span>
          <b>handler 绑定</b><span>{{ handlerBindingCount }}</span>
          <b>start 调用</b><span>{{ startModeCount }}</span>
          <b>close 调用</b><span>{{ closeCount }}</span>
          <b>草稿数量</b><span>{{ drafts.length }}</span>
          <b>Pinia 提交</b><span>{{ storeSubmitCount }}</span>
          <b>adapter sync</b><span>{{ adapterSyncCount }}</span>
          <b>泄漏实例</b><span>{{ leakedMouseToolCount }}</span>
          <b>双 Session</b><span>{{ doubleSessionCount }}</span>
          <b>父级回放</b><span>{{ parentBridgeReplayCount }}</span>
          <b>撤回提交</b><span>{{ withdrawnSubmitCount }}</span>
          <b>持久化回声</b><span>{{ persistenceEchoCount }}</span>
          <b>存储命中</b><span>{{ storedDiagnosticFeatureCount }} / {{ submittedFeatureIds.length }}</span>
          <b>working / redo</b><span>{{ storeOperationSummary.working }} / {{ storeOperationSummary.redo }}</span>
        </div>

        <div class="panel-section parent-state">
          <p class="section-title">父子状态回传</p>
          <div class="state-grid">
            <b>启用</b><span>{{ usesParentFeedback ? '是' : '否' }}</span>
            <b>回传次数</b><span>{{ parentEchoCount }}</span>
            <b>drawing</b><span>{{ parentDraftState.drawing ? 'true' : 'false' }}</span>
            <b>draftCount</b><span>{{ parentDraftState.draftCount }}</span>
            <b>message</b><span>{{ parentDraftState.message }}</span>
          </div>
        </div>
      </aside>

      <section class="map-zone">
        <div ref="container" class="map-canvas"></div>
        <div class="map-status">{{ statusText }}</div>
      </section>

      <aside class="demo-panel">
        <div class="panel-section">
          <p class="section-title">事件日志</p>
          <div class="log-list">
            <p v-if="!logs.length" class="muted">暂无事件</p>
            <p v-for="log in logs" :key="log">{{ log }}</p>
          </div>
        </div>

        <div class="panel-section">
          <p class="section-title">本阶段 GeoJSON</p>
          <pre class="geojson-preview">{{ geojsonText }}</pre>
        </div>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.transition-demo {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 12px;
  padding: 16px;
  background: #f4f1e9;
  color: #27231a;
  font-family: Inter, "Microsoft YaHei", sans-serif;
}

.demo-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.demo-header h1 {
  margin: 4px 0 0;
  font-size: 22px;
  letter-spacing: 0;
}

.eyebrow,
.section-title,
.muted {
  margin: 0;
  color: #716b5e;
  font-size: 12px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-input {
  width: 180px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #d4cdbd;
  border-radius: 6px;
  background: #fff;
  color: #27231a;
}

.stage-table {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 8px;
}

.stage-row {
  min-height: 86px;
  display: grid;
  align-content: start;
  gap: 5px;
  padding: 10px;
  border: 1px solid #d9d0bf;
  border-radius: 8px;
  background: rgba(255, 255, 255, .72);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.stage-row.active {
  border-color: #2f6f8f;
  background: #fff;
  box-shadow: inset 0 0 0 1px #2f6f8f;
}

.stage-row b {
  font-size: 13px;
}

.stage-row span,
.stage-row em {
  font-size: 11px;
  line-height: 1.35;
}

.stage-row em {
  color: #716b5e;
  font-style: normal;
}

.demo-shell {
  min-height: 0;
  display: grid;
  grid-template-columns: 320px minmax(460px, 1fr) 340px;
  gap: 12px;
}

.demo-panel {
  min-height: 0;
  overflow: auto;
  scrollbar-width: none;
  display: grid;
  align-content: start;
  gap: 10px;
}

.demo-panel::-webkit-scrollbar {
  display: none;
}

.panel-section {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid #d9d0bf;
  border-radius: 8px;
  background: rgba(255, 255, 255, .78);
}

.panel-section h2 {
  margin: 0;
  font-size: 18px;
}

.demo-button,
.segmented button {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #d0c7b5;
  border-radius: 6px;
  background: #fff;
  color: #27231a;
  cursor: pointer;
}

.demo-button:disabled {
  cursor: not-allowed;
  opacity: .45;
}

.demo-button.primary,
.demo-button.active,
.segmented button.active {
  border-color: #2f6f8f;
  background: #2f6f8f;
  color: #fff;
}

.segmented,
.draw-buttons,
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.draw-buttons {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.state-grid {
  grid-template-columns: minmax(92px, auto) minmax(0, 1fr);
  align-items: center;
}

.state-grid b,
.state-grid span {
  min-width: 0;
  font-size: 12px;
}

.state-grid span {
  overflow-wrap: anywhere;
  color: #514b40;
}

.map-zone {
  position: relative;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #cfc5b4;
  border-radius: 8px;
  background:
    linear-gradient(rgba(37, 33, 22, .06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(37, 33, 22, .06) 1px, transparent 1px),
    #dfe7df;
  background-size: 30px 30px;
}

.map-canvas {
  position: absolute;
  inset: 0;
}

.map-status {
  position: absolute;
  left: 50%;
  top: 14px;
  z-index: 3;
  max-width: min(720px, calc(100% - 48px));
  transform: translateX(-50%);
  padding: 7px 12px;
  border: 1px solid #d9d0bf;
  border-radius: 6px;
  background: rgba(255, 255, 255, .92);
  box-shadow: 0 8px 24px rgba(38, 34, 26, .12);
  color: #27231a;
  font-size: 12px;
  pointer-events: none;
}

.log-list {
  max-height: 280px;
  overflow: auto;
  scrollbar-width: none;
  display: grid;
  align-content: start;
  gap: 6px;
}

.log-list::-webkit-scrollbar {
  display: none;
}

.log-list p {
  margin: 0;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(39, 35, 26, .08);
  color: #514b40;
  font-size: 12px;
  line-height: 1.4;
}

.geojson-preview {
  max-height: 300px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  background: #27231a;
  color: #f8f3e7;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
}
</style>
