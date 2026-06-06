<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMapDocumentStore, type SavedMapDocument } from '../stores/mapDocumentStore';
import ConfirmActionDialog from './shared/ConfirmActionDialog.vue';
import TextInputDialog from './shared/TextInputDialog.vue';

const mapDocumentStore = useMapDocumentStore();
const keyword = ref('');
const createMapDialogOpen = ref(false);
const renameMapDialogOpen = ref(false);
const deleteMapDialogOpen = ref(false);
const selectedDocument = ref<SavedMapDocument | null>(null);

const visibleDocuments = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) {
    return mapDocumentStore.savedDocuments;
  }

  return mapDocumentStore.savedDocuments.filter((document) => (
    document.name.toLowerCase().includes(value)
  ));
});

const activeDocumentId = computed(() => {
  const activeRef = mapDocumentStore.activeDocumentRef;
  return activeRef.kind === 'saved' ? activeRef.id : '';
});

function summarizeDocument(document: SavedMapDocument) {
  const workLayers = document.layers.filter((layer) => layer.role === 'work').length;
  const referenceLayers = document.layers.filter((layer) => layer.role === 'reference').length;
  const featureCount = Object.keys(document.features).length;
  return `${workLayers} 个正式图层 · ${referenceLayers} 个参考图层 · ${featureCount} 个要素`;
}

const selectedDocumentSummary = computed(() => {
  if (!selectedDocument.value) {
    return [];
  }

  const document = selectedDocument.value;
  return [
    { label: '地图名称', value: document.name },
    { label: '图层数量', value: document.layers.length },
    { label: '要素数量', value: Object.keys(document.features).length }
  ];
});

const deleteMapDescription = computed(() => {
  if (!selectedDocument.value) {
    return '这个操作会移除地图和其中的图层/要素。';
  }

  return `删除地图「${selectedDocument.value.name}」？这个操作会移除地图和其中的图层/要素。`;
});

function openCreateMapDialog() {
  createMapDialogOpen.value = true;
}

function confirmCreateMap(name: string) {
  mapDocumentStore.createMap({ name });
}

function openRenameMapDialog(document: SavedMapDocument) {
  selectedDocument.value = document;
  renameMapDialogOpen.value = true;
}

function confirmRenameMap(name: string) {
  if (!selectedDocument.value || name === selectedDocument.value.name) {
    return;
  }

  mapDocumentStore.renameMap({
    mapId: selectedDocument.value.id,
    name
  });
  selectedDocument.value = null;
}

function openDeleteMapDialog(document: SavedMapDocument) {
  selectedDocument.value = document;
  deleteMapDialogOpen.value = true;
}

function confirmDeleteMap() {
  if (!selectedDocument.value) {
    return;
  }

  mapDocumentStore.deleteMap(selectedDocument.value.id);
  selectedDocument.value = null;
}
</script>

<template>
  <div class="map-document-list">
    <div class="project-list-toolbar">
      <label class="project-search" for="map-document-search">
        <span>地图</span>
        <input
          id="map-document-search"
          v-model="keyword"
          name="mapDocumentSearch"
          type="search"
          placeholder="搜索地图"
          autocomplete="off"
        >
      </label>
      <button class="project-create-button" type="button" title="新建地图" @click="openCreateMapDialog">
        新建
      </button>
    </div>

    <div class="project-list">
      <article
        v-for="document in visibleDocuments"
        :key="document.id"
        class="project-card"
        :class="{ active: activeDocumentId === document.id }"
      >
        <button
          class="project-select-button"
          type="button"
          @click="mapDocumentStore.setActiveDocument({ kind: 'saved', id: document.id })"
        >
          <span class="project-icon">图</span>
          <span class="project-main">
            <b>{{ document.name }}</b>
            <span>{{ summarizeDocument(document) }}</span>
          </span>
          <span class="project-badge">{{ document.layers.length }}</span>
        </button>

        <div class="project-card-actions">
          <button class="project-action-button" type="button" title="重命名地图" @click="openRenameMapDialog(document)">
            改
          </button>
          <button class="project-action-button danger" type="button" title="删除地图" @click="openDeleteMapDialog(document)">
            删
          </button>
        </div>
      </article>

      <div v-if="!visibleDocuments.length" class="empty-state compact">
        <b>暂无地图</b>
        <span>保存草稿后，真实 MapDocument 会进入这里。</span>
      </div>
    </div>

    <TextInputDialog
      v-model:open="createMapDialogOpen"
      dialog-id="create-map-dialog"
      title="新建地图"
      description="创建后会直接进入项目列表，并切换为当前地图。"
      label="地图名称"
      placeholder="请输入地图名称"
      initial-value="新建地图"
      confirm-text="新建"
      @confirm="confirmCreateMap"
    />

    <TextInputDialog
      v-model:open="renameMapDialogOpen"
      dialog-id="rename-map-dialog"
      title="重命名地图"
      description="只修改地图名称，不影响图层和要素。"
      label="地图名称"
      placeholder="请输入地图名称"
      :initial-value="selectedDocument?.name ?? ''"
      :summary-rows="selectedDocumentSummary"
      confirm-text="保存"
      @confirm="confirmRenameMap"
    />

    <ConfirmActionDialog
      v-model:open="deleteMapDialogOpen"
      dialog-id="delete-map-dialog"
      title="删除地图"
      :description="deleteMapDescription"
      :summary-rows="selectedDocumentSummary"
      confirm-text="删除"
      danger
      @confirm="confirmDeleteMap"
    />
  </div>
</template>
