<script setup lang="ts">
import type { LocalMapCommit } from '../../stores/mapDocumentStore';

defineProps<{
  commit: LocalMapCommit;
}>();

function commitStatusLabel(status: LocalMapCommit['syncStatus']) {
  const labels: Record<LocalMapCommit['syncStatus'], string> = {
    local: '本地',
    syncing: '同步中',
    synced: '已同步',
    conflict: '冲突'
  };
  return labels[status];
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
  <article class="operation-card commit-card">
    <div class="operation-card-head">
      <b>{{ commit.message || commit.id }}</b>
      <span>{{ commitStatusLabel(commit.syncStatus) }}</span>
    </div>
    <div class="operation-card-meta">
      <span>{{ formatTime(commit.createdAt) }}</span>
      <span>{{ commit.operations.length }} 个操作</span>
    </div>
  </article>
</template>
