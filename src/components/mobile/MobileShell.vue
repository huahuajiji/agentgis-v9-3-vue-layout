<script setup lang="ts">
import { computed, ref } from 'vue';
import AccountModal from '../AccountModal.vue';
import AmapBaseMap from '../AmapBaseMap.vue';
import DraftMapSaveDialog from '../DraftMapSaveDialog.vue';
import GeoJsonTransferPanel from '../GeoJsonTransferPanel.vue';
import LayerImageResourcesPanel from '../LayerImageResourcesPanel.vue';
import MapBoundsFrame from '../MapBoundsFrame.vue';
import MapDocumentList from '../MapDocumentList.vue';
import MapModeSelector from '../MapModeSelector.vue';
import LayerCreateDialog from '../shared/LayerCreateDialog.vue';
import LayerFeatureTree from '../shared/LayerFeatureTree.vue';
import OperationHistoryPanel from '../shared/OperationHistoryPanel.vue';
import { useGeometryEditTarget } from '../../shared/map/useGeometryEditTarget';
import { useMapDocumentStore, type LayerGeometryType, type LayerRole } from '../../stores/mapDocumentStore';
import type { MapMode, MapTool, MobileTab } from '../../types';
import MobileBottomNav from './MobileBottomNav.vue';

type MobileDataPanel = 'work' | 'reference' | 'geojson' | 'operations';

const activeTab = ref<MobileTab>('map');
const activeMode = ref<MapMode>('浏览');
const activeTool = ref<MapTool>('');
const activeDataPanel = ref<MobileDataPanel>('work');
const workLayersSorting = ref(false);
const referenceLayersSorting = ref(false);
const accountModalOpen = ref(false);
const draftSaveDialogOpen = ref(false);
const createLayerDialogOpen = ref(false);
const createLayerRole = ref<LayerRole>('work');
const mapDocumentStore = useMapDocumentStore();
const { geometryEditFeatureId } = useGeometryEditTarget(activeMode, activeTool);

const activeDocument = computed(() => mapDocumentStore.activeDocument);
const isDraftDocument = computed(() => mapDocumentStore.activeDocumentRef.kind === 'draft');
const workLayerCount = computed(() => activeDocument.value.layers.filter((layer) => layer.role === 'work').length);
const referenceLayerCount = computed(() => activeDocument.value.layers.filter((layer) => layer.role === 'reference').length);
const featureCount = computed(() => Object.keys(activeDocument.value.features).length);
const drawingEnabled = computed(() => activeMode.value === '编辑' && activeTool.value === '绘制');
const documentSubtitle = computed(() => (
  `${workLayerCount.value} 个正式图层 · ${referenceLayerCount.value} 个参考图层 · ${featureCount.value} 个要素`
));
const mapStatusText = computed(() => {
  const suffix = activeTool.value ? ` · ${activeTool.value}` : '';
  const editTarget = geometryEditFeatureId.value ? ' · 正在编辑选中要素' : '';
  return `移动端 · ${activeMode.value}${suffix}${editTarget}`;
});
const dataPanelTitle = computed(() => {
  if (activeDataPanel.value === 'reference') return '参考图层';
  if (activeDataPanel.value === 'geojson') return 'GeoJSON';
  if (activeDataPanel.value === 'operations') return '操作记录';
  return '正式图层';
});

function openDraftSaveDialog() {
  if (!isDraftDocument.value) {
    return;
  }

  draftSaveDialogOpen.value = true;
}

function openCreateLayerDialog(role: LayerRole) {
  createLayerRole.value = role;
  createLayerDialogOpen.value = true;
}

function createLayer(input: { name: string; geometryType: LayerGeometryType }) {
  mapDocumentStore.createLayer({
    name: input.name,
    role: createLayerRole.value,
    geometryType: input.geometryType
  });
}

function isDataPanelOpen(panel: MobileDataPanel) {
  return activeDataPanel.value === panel;
}
</script>

<template>
  <main class="mobile-shell">
    <section v-if="activeTab === 'map'" class="mobile-screen mobile-map-screen">
      <header class="mobile-topbar">
        <div class="mobile-title">
          <b>{{ activeDocument.name }}</b>
          <span>{{ documentSubtitle }}</span>
        </div>
        <button
          class="mobile-text-button"
          type="button"
          :disabled="!isDraftDocument"
          @click="openDraftSaveDialog"
        >
          {{ isDraftDocument ? '保存' : '已保存' }}
        </button>
      </header>

      <section class="mobile-map-stage">
        <section class="mobile-live-map">
          <AmapBaseMap
            :drawing-enabled="drawingEnabled"
            :geometry-edit-feature-id="geometryEditFeatureId"
            :status-text="mapStatusText"
          />
          <MapBoundsFrame inset="14px 14px 92px" />
        </section>

        <section class="mobile-map-toolbar">
          <MapModeSelector v-model:mode="activeMode" v-model:tool="activeTool" />
        </section>
      </section>
    </section>

    <section v-else-if="activeTab === 'project'" class="mobile-screen">
      <header class="mobile-topbar">
        <div class="mobile-title">
          <b>项目</b>
          <span>切换地图与图片资源</span>
        </div>
      </header>

      <section class="mobile-scroll">
        <section class="mobile-card">
          <div class="panel-head">
            <h3>地图列表</h3>
            <span>MapDocument</span>
          </div>
          <div class="panel-body">
            <MapDocumentList />
          </div>
        </section>

        <section class="mobile-card">
          <div class="panel-head">
            <h3>图片资源</h3>
            <span>MapLayer.imageResources</span>
          </div>
          <div class="panel-body">
            <LayerImageResourcesPanel />
          </div>
        </section>

      </section>
    </section>

    <section v-else-if="activeTab === 'data'" class="mobile-screen">
      <header class="mobile-topbar">
        <div class="mobile-title">
          <b>数据</b>
          <span>{{ dataPanelTitle }}</span>
        </div>
        <button
          v-if="activeDataPanel === 'work' || activeDataPanel === 'reference'"
          class="mobile-text-button"
          type="button"
          @click="openCreateLayerDialog(activeDataPanel === 'reference' ? 'reference' : 'work')"
        >
          新建
        </button>
      </header>

      <section class="mobile-data-tabs" aria-label="数据面板">
        <button
          class="mobile-data-tab"
          :class="{ active: isDataPanelOpen('work') }"
          type="button"
          @click="activeDataPanel = 'work'"
        >
          正式
        </button>
        <button
          class="mobile-data-tab"
          :class="{ active: isDataPanelOpen('reference') }"
          type="button"
          @click="activeDataPanel = 'reference'"
        >
          参考
        </button>
        <button
          class="mobile-data-tab"
          :class="{ active: isDataPanelOpen('geojson') }"
          type="button"
          @click="activeDataPanel = 'geojson'"
        >
          GeoJSON
        </button>
        <button
          class="mobile-data-tab"
          :class="{ active: isDataPanelOpen('operations') }"
          type="button"
          @click="activeDataPanel = 'operations'"
        >
          操作
        </button>
      </section>

      <section class="mobile-scroll mobile-data-scroll">
        <section v-if="activeDataPanel === 'work'" class="mobile-card">
          <div class="panel-head">
            <h3>正式图层</h3>
            <button
              class="text-action"
              :class="{ active: workLayersSorting }"
              type="button"
              @click="workLayersSorting = !workLayersSorting"
            >
              排序
            </button>
          </div>
          <div class="panel-body">
            <LayerFeatureTree variant="work" :sorting="workLayersSorting" />
          </div>
        </section>

        <section v-else-if="activeDataPanel === 'reference'" class="mobile-card">
          <div class="panel-head">
            <h3>参考图层</h3>
            <button
              class="text-action"
              :class="{ active: referenceLayersSorting }"
              type="button"
              @click="referenceLayersSorting = !referenceLayersSorting"
            >
              排序
            </button>
          </div>
          <div class="panel-body">
            <LayerFeatureTree variant="reference" :sorting="referenceLayersSorting" />
          </div>
        </section>

        <section v-else-if="activeDataPanel === 'geojson'" class="mobile-card">
          <div class="panel-head">
            <h3>GeoJSON 导入</h3>
            <span>FeatureCollection</span>
          </div>
          <div class="panel-body">
            <GeoJsonTransferPanel />
          </div>
        </section>

        <section v-else class="mobile-card">
          <div class="panel-head">
            <h3>操作记录</h3>
            <span>undo / redo</span>
          </div>
          <div class="panel-body">
            <OperationHistoryPanel />
          </div>
        </section>
      </section>
    </section>

    <section v-else class="mobile-screen">
      <header class="mobile-topbar">
        <div class="mobile-title">
          <b>我的</b>
          <span>账户、工作区与 BYOK</span>
        </div>
        <button class="mobile-text-button" type="button" @click="accountModalOpen = true">
          账户
        </button>
      </header>

      <section class="mobile-scroll">
        <section class="mobile-card">
          <div class="panel-head">
            <h3>当前地图</h3>
            <span>{{ isDraftDocument ? '草稿' : '真实地图' }}</span>
          </div>
          <div class="panel-body">
            <section class="detail-card">
              <div class="detail-body">
                <div class="detail-grid">
                  <div class="detail-field">
                    <span>地图名称</span>
                    <b>{{ activeDocument.name }}</b>
                  </div>
                  <div class="detail-field">
                    <span>正式图层</span>
                    <b>{{ workLayerCount }}</b>
                  </div>
                  <div class="detail-field">
                    <span>参考图层</span>
                    <b>{{ referenceLayerCount }}</b>
                  </div>
                  <div class="detail-field">
                    <span>要素数量</span>
                    <b>{{ featureCount }}</b>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>

      </section>
    </section>

    <MobileBottomNav v-model:active-tab="activeTab" />

    <DraftMapSaveDialog v-model:open="draftSaveDialogOpen" />
    <LayerCreateDialog
      v-model:open="createLayerDialogOpen"
      :role="createLayerRole"
      @confirm="createLayer"
    />
    <AccountModal :open="accountModalOpen" @close="accountModalOpen = false" />
  </main>
</template>
