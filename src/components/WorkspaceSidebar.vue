<script setup lang="ts">
import { computed, ref } from 'vue';
import type { NavSection } from '../types';
import GeoJsonTransferPanel from './GeoJsonTransferPanel.vue';
import LayerImageResourcesPanel from './LayerImageResourcesPanel.vue';
import MapDocumentList from './MapDocumentList.vue';
import PlaceholderBlock from './shared/PlaceholderBlock.vue';

const props = defineProps<{
  activeSection: NavSection;
  collapsed: boolean;
}>();

type PanelConfig = {
  title: string;
  meta: string;
  shape:
    | 'list'
    | 'field-list'
    | 'block'
    | 'compact-list'
    | 'external-reference'
    | 'geojson-transfer'
    | 'map-documents'
    | 'image-resources'
    | 'ai';
};

const amapPoiCategories = [
  { label: '汽车服务', value: '010000' },
  { label: '汽车销售', value: '020000' },
  { label: '汽车维修', value: '030000' },
  { label: '摩托车服务', value: '040000' },
  { label: '餐饮服务', value: '050000' },
  { label: '购物服务', value: '060000' },
  { label: '生活服务', value: '070000' },
  { label: '体育休闲服务', value: '080000' },
  { label: '医疗保健服务', value: '090000' },
  { label: '住宿服务', value: '100000' },
  { label: '风景名胜', value: '110000' },
  { label: '商务住宅', value: '120000' },
  { label: '政府机构及社会团体', value: '130000' },
  { label: '科教文化服务', value: '140000' },
  { label: '交通设施服务', value: '150000' },
  { label: '金融保险服务', value: '160000' },
  { label: '公司企业', value: '170000' },
  { label: '道路附属设施', value: '180000' },
  { label: '地名地址信息', value: '190000' },
  { label: '公共设施', value: '200000' }
] as const;

const panelsBySection: Record<NavSection, PanelConfig[]> = {
  地图: [
    { title: '视图设置', meta: '空状态', shape: 'list' },
    { title: '地图工具', meta: '空状态', shape: 'compact-list' }
  ],
  项目: [
    { title: '项目列表', meta: 'MapDocument', shape: 'map-documents' },
    { title: '图片资源', meta: 'MapLayer.imageResources', shape: 'image-resources' },
    { title: '版本', meta: '空状态', shape: 'compact-list' }
  ],
  数据: [
    { title: '查找外部数据', meta: '/api/map/reference-amap', shape: 'external-reference' },
    { title: 'GeoJSON 导入 / 导出', meta: 'FeatureCollection', shape: 'geojson-transfer' },
    { title: '数据源', meta: '空状态', shape: 'field-list' },
    { title: '引用数据', meta: '空状态', shape: 'block' },
    { title: '导入队列', meta: '空状态', shape: 'compact-list' }
  ],
  AI: [
    { title: 'AI 对话', meta: '空状态', shape: 'ai' },
    { title: '执行预览', meta: '空状态', shape: 'block' },
    { title: '上下文', meta: '空状态', shape: 'compact-list' }
  ],
  历史: [
    { title: '执行记录', meta: '空状态', shape: 'list' },
    { title: '操作历史', meta: '空状态', shape: 'block' }
  ],
  设置: [
    { title: '接口配置', meta: '空状态', shape: 'field-list' },
    { title: '偏好设置', meta: '空状态', shape: 'list' }
  ],
};

const activePanels = computed(() => panelsBySection[props.activeSection]);
const upperPanels = computed(() => activePanels.value.filter((panel) => panel.shape !== 'ai'));
const aiPanel = computed(() => activePanels.value.find((panel) => panel.shape === 'ai'));
const openPanels = ref<Set<string>>(new Set());

function panelKey(panel: PanelConfig) {
  return `${props.activeSection}:${panel.title}`;
}

function isPanelOpen(panel: PanelConfig) {
  const key = panelKey(panel);
  return !openPanels.value.has(key);
}

function togglePanel(panel: PanelConfig) {
  const key = panelKey(panel);
  const next = new Set(openPanels.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  openPanels.value = next;
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <header class="side-head">
      <h1>{{ activeSection }}工作区</h1>
    </header>

    <section class="side-scroll" :class="{ 'with-fixed-ai': aiPanel }">
      <section
        v-for="panel in upperPanels"
        :key="panel.title"
        class="panel side-panel"
        :class="{ 'is-collapsed-panel': !isPanelOpen(panel) }"
      >
        <button class="panel-head collapsible-panel-head" type="button" @click="togglePanel(panel)">
          <span class="panel-chevron">{{ isPanelOpen(panel) ? '▾' : '▸' }}</span>
          <h3>{{ panel.title }}</h3>
          <span>{{ panel.meta }}</span>
        </button>
        <div v-if="isPanelOpen(panel) && panel.shape === 'external-reference'" class="panel-body">
          <div class="external-reference-form">
            <div class="external-field-grid">
              <input
                id="external-reference-city"
                name="externalReferenceCity"
                type="text"
                placeholder="城市"
                autocomplete="off"
              >
              <input
                id="external-reference-place"
                name="externalReferencePlace"
                type="text"
                placeholder="地点"
                autocomplete="off"
              >
            </div>

            <div class="external-category-head">
              <span>POI 类型</span>
              <small>20 类</small>
            </div>
            <div class="external-category-grid" aria-label="外部数据类型">
              <label
                v-for="category in amapPoiCategories"
                :key="category.value"
                class="external-check"
                :for="`external-reference-${category.value}`"
              >
                <input
                  :id="`external-reference-${category.value}`"
                  name="externalReferenceTypes"
                  type="checkbox"
                  :value="category.value"
                >
                <span>{{ category.label }}</span>
              </label>
            </div>

            <button class="button primary external-load-button" type="button">加载为引用点</button>
          </div>
        </div>
        <div v-else-if="isPanelOpen(panel) && panel.shape === 'map-documents'" class="panel-body">
          <MapDocumentList />
        </div>
        <div v-else-if="isPanelOpen(panel) && panel.shape === 'image-resources'" class="panel-body">
          <LayerImageResourcesPanel />
        </div>
        <div v-else-if="isPanelOpen(panel) && panel.shape === 'geojson-transfer'" class="panel-body">
          <GeoJsonTransferPanel />
        </div>
        <div v-else-if="isPanelOpen(panel) && panel.shape === 'field-list'" class="panel-body empty-stack">
          <PlaceholderBlock kind="field" />
          <PlaceholderBlock />
          <PlaceholderBlock />
          <PlaceholderBlock />
        </div>
        <div v-else-if="isPanelOpen(panel) && panel.shape === 'compact-list'" class="panel-body empty-stack">
          <PlaceholderBlock />
          <PlaceholderBlock />
          <PlaceholderBlock />
        </div>
        <div v-else-if="isPanelOpen(panel) && panel.shape === 'list'" class="panel-body empty-stack">
          <PlaceholderBlock />
          <PlaceholderBlock />
          <PlaceholderBlock />
          <PlaceholderBlock />
        </div>
        <div v-else-if="isPanelOpen(panel)" class="panel-body">
          <PlaceholderBlock kind="block" />
        </div>
      </section>
    </section>

    <section v-if="aiPanel" class="fixed-ai-panel">
      <div class="panel-head">
        <h3>{{ aiPanel.title }}</h3>
        <span>{{ aiPanel.meta }}</span>
      </div>
      <div class="panel-body">
        <PlaceholderBlock kind="composer" />
        <div class="agent-actions">
          <button class="button" type="button">清空</button>
          <button class="button primary" type="button">运行</button>
        </div>
      </div>
    </section>
  </aside>
</template>
