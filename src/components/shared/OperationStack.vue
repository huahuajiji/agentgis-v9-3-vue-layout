<script setup lang="ts">
import type { MapOperation } from '../../stores/mapDocumentStore';
import OperationCard from './OperationCard.vue';

defineProps<{
  workingOperations: MapOperation[];
  redoOperations: MapOperation[];
  totalStackOperations: number;
}>();
</script>

<template>
  <div class="operation-stack">
    <div class="operation-stack-redo">
      <div class="operation-stack-label">
        <span>可重做</span>
        <b>{{ redoOperations.length }}</b>
      </div>
      <div v-if="redoOperations.length" class="operation-list redo-operation-list">
        <OperationCard
          v-for="operation in redoOperations"
          :key="operation.id"
          :operation="operation"
          variant="redo"
        />
      </div>

      <div v-else class="empty-state compact redo-empty-state">
        <b>暂无可重做操作</b>
        <span>撤销后，可重做操作会在当前位置上方向上堆叠。</span>
      </div>
    </div>

    <div class="operation-stack-cursor">
      <span>当前位置</span>
      <b>{{ workingOperations.length }} / {{ totalStackOperations }}</b>
    </div>

    <div class="operation-stack-done">
      <div class="operation-stack-label">
        <span>已执行</span>
        <b>{{ workingOperations.length }}</b>
      </div>
      <div v-if="workingOperations.length" class="operation-list">
        <OperationCard
          v-for="operation in workingOperations"
          :key="operation.id"
          :operation="operation"
        />
      </div>

      <div v-else class="empty-state compact">
        <b>暂无已执行操作</b>
        <span>图层和要素变化会记录在这里，导入数据也会生成一条批量记录。</span>
      </div>
    </div>
  </div>
</template>
