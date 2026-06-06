<script setup lang="ts">
import { computed } from 'vue';
import { useMapDocumentStore } from '../stores/mapDocumentStore';

const mapDocumentStore = useMapDocumentStore();

const activeLayer = computed(() => {
  const document = mapDocumentStore.activeDocument;
  return document.layers.find((layer) => layer.id === document.selectedLayerId)
    ?? document.layers.find((layer) => layer.role === 'work')
    ?? document.layers[0]
    ?? null;
});

const firstResource = computed(() => activeLayer.value?.imageResources[0] ?? null);
</script>

<template>
  <div class="side-resource-panel">
    <section v-if="activeLayer" class="detail-card">
      <div class="detail-body">
        <div class="detail-grid">
          <div class="detail-field">
            <span>所属图层</span>
            <b>{{ activeLayer.name }}</b>
          </div>
          <div class="detail-field">
            <span>资源数量</span>
            <b>{{ activeLayer.imageResources.length }}</b>
          </div>
          <div class="detail-field">
            <span>首个资源</span>
            <b>{{ firstResource?.name ?? '-' }}</b>
          </div>
          <div class="detail-field">
            <span>存储字段</span>
            <b>MapLayer.imageResources</b>
          </div>
        </div>
      </div>
    </section>

    <div v-else class="empty-state compact">
      <b>暂无图层</b>
      <span>当前 MapDocument 没有可读取的图层。</span>
    </div>
  </div>
</template>
