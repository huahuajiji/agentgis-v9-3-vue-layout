<script setup lang="ts">
import type { ExternalMapOperationRecord, MapOperation, MapOperationSource } from '../../stores/mapDocumentStore';

defineProps<{
  record: ExternalMapOperationRecord;
}>();
defineEmits<{
  apply: [recordId: string];
  match: [recordId: string];
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

function statusLabel(status: ExternalMapOperationRecord['status']) {
  const labels: Record<ExternalMapOperationRecord['status'], string> = {
    pending: '待匹配',
    applied: '已匹配',
    mismatch: '未对上',
    failed: '异常'
  };
  return labels[status];
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

function formatTime(value: string | null | undefined) {
  if (!value) {
    return '未检查';
  }

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
  <article class="operation-card external-operation-card" :class="`external-operation-card-${record.status}`">
    <div class="operation-card-head">
      <b>{{ record.operation.summary }}</b>
      <span>{{ statusLabel(record.status) }}</span>
    </div>
    <div class="operation-card-meta">
      <span>{{ operationTypeLabel(record.operation.type) }} · {{ sourceLabel(record.source) }}</span>
      <span>{{ operationTarget(record.operation) }}</span>
    </div>
    <p>{{ record.message ?? '等待外部操作被应用后，与地图实际生成的内部操作匹配。' }}</p>
    <div class="operation-card-meta">
      <span>{{ formatTime(record.checkedAt) }}</span>
      <span>{{ record.matchedOperationId ?? '无匹配操作' }}</span>
    </div>
    <div class="external-operation-actions">
      <button
        class="text-action"
        type="button"
        :disabled="record.status === 'applied'"
        @click="$emit('apply', record.id)"
      >
        应用
      </button>
      <button class="text-action" type="button" @click="$emit('match', record.id)">
        匹配
      </button>
    </div>
  </article>
</template>
