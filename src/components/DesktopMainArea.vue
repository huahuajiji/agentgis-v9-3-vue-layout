<script setup lang="ts">
import { computed, ref } from 'vue';
import DraftMapSaveDialog from './DraftMapSaveDialog.vue';
import InspectorPanel from './InspectorPanel.vue';
import MapWorkspace from './MapWorkspace.vue';
import { useGeometryEditTarget } from '../shared/map/useGeometryEditTarget';
import { useMapDocumentStore } from '../stores/mapDocumentStore';
import type { InspectorMode, MapAction, MapMode, MapTool, NavSection } from '../types';

defineProps<{
  activeSection: NavSection;
  inspectorCollapsed: boolean;
}>();

const activeMode = ref<MapMode>('浏览');
const activeTool = ref<MapTool>('');
const activeMapAction = ref<MapAction>('');
const activeInspector = ref<InspectorMode>('要素');
const draftSaveDialogOpen = ref(false);
const mapDocumentStore = useMapDocumentStore();
const { geometryEditFeatureId } = useGeometryEditTarget(activeMode, activeTool);

const workspaceTitle = computed(() => mapDocumentStore.activeDocument.name);
const workspaceSubtitle = computed(
  () => {
    const document = mapDocumentStore.activeDocument;
    const workLayers = document.layers.filter((layer) => layer.role === 'work').length;
    const referenceLayers = document.layers.filter((layer) => layer.role === 'reference').length;
    const featureCount = Object.keys(document.features).length;
    return `${workLayers} 个正式图层 · ${referenceLayers} 个参考图层 · ${featureCount} 个要素 · ${activeMode.value}模式 · ${activeInspector.value}检查器`;
  }
);
function openDraftSaveDialog() {
  if (mapDocumentStore.activeDocumentRef.kind !== 'draft') {
    return;
  }

  draftSaveDialogOpen.value = true;
}
</script>

<template>
  <section class="workspace">
    <header class="workspace-head">
      <div class="head-context">
        <b>{{ workspaceTitle }}</b>
        <span>{{ workspaceSubtitle }}</span>
      </div>
      <slot name="head-actions"></slot>
    </header>

    <section class="main-grid" :class="{ 'is-inspector-collapsed': inspectorCollapsed }">
      <MapWorkspace
        v-model:mode="activeMode"
        v-model:tool="activeTool"
        v-model:map-action="activeMapAction"
        :geometry-edit-feature-id="geometryEditFeatureId"
        @save-draft="openDraftSaveDialog"
      />

      <InspectorPanel
        v-model:mode="activeInspector"
        :collapsed="inspectorCollapsed"
      />
    </section>

    <DraftMapSaveDialog v-model:open="draftSaveDialogOpen" />
  </section>
</template>
