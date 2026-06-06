<script setup lang="ts">
import type { MapOperation, MapOperationSource } from '../../stores/mapDocumentStore';

defineProps<{
  operation: MapOperation;
  variant?: 'done' | 'redo';
}>();

function operationTypeLabel(type: MapOperation['type']) {
  const labels: Record<MapOperation['type'], string> = {
    'layer.create': '图层新增',
    'layer.update': '图层更新',
    'layer.delete': '图层删除',
    'feature.create': '要素新增',
    'feature.update': '要素更新',
    'feature.delete': '要素删除',
    'geojson.import': '数据导入'
  };
  return labels[type];
}

function sourceLabel(source: MapOperationSource) {
  const labels: Record<MapOperationSource, string> = {
    user: '用户',
    ai: 'AI',
    backend: '后端',
    file: '文件',
    system: '系统'
  };
  return labels[source];
}

function operationTarget(operation: MapOperation) {
  if (operation.type === 'geojson.import') {
    return `${operation.layerIds.length} 个图层 · ${operation.featureIds.length} 个要素`;
  }
  if ('featureId' in operation) {
    return operation.featureId;
  }
  return operation.layerId;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
</script>

<template>
  <article class="operation-card" :class="{ 'redo-operation-card': variant === 'redo' }">
    <div class="operation-card-head">
      <b>{{ operation.summary }}</b>
      <span>{{ operationTypeLabel(operation.type) }} · {{ sourceLabel(operation.source) }}</span>
    </div>
    <div class="operation-card-meta">
      <span>{{ formatTime(operation.createdAt) }}</span>
      <span>{{ operationTarget(operation) }}</span>
    </div>
    <p v-if="operation.detail">{{ operation.detail }}</p>
  </article>
</template>
