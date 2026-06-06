<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMapDocumentStore } from '../../stores/mapDocumentStore';
import CommitCard from './CommitCard.vue';
import ExternalOperationCard from './ExternalOperationCard.vue';
import OperationStack from './OperationStack.vue';

type OperationPanelSection = 'summary' | 'working' | 'external' | 'commits';

const mapDocumentStore = useMapDocumentStore();
const openSections = ref<Set<OperationPanelSection>>(new Set(['summary', 'working', 'external', 'commits']));

const editState = computed(() => mapDocumentStore.activeDocument.edit);
const workingOperations = computed(() => editState.value.workingOperations.slice().reverse());
const redoOperations = computed(() => editState.value.redoOperations);
const totalStackOperations = computed(() => (
  editState.value.workingOperations.length + editState.value.redoOperations.length
));
const externalOperations = computed(() => editState.value.externalOperations);
const pendingExternalOperations = computed(() => (
  externalOperations.value.filter((operation) => operation.status === 'pending')
));
const commits = computed(() => (
  Object.values(editState.value.commitsById)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
));
const hasCommitAction = computed(() => typeof mapDocumentStore.commitWorkingOperations === 'function');
const canCommit = computed(() => hasCommitAction.value && editState.value.workingOperations.length > 0);
const canUndo = computed(() => editState.value.workingOperations.length > 0);
const canRedo = computed(() => editState.value.redoOperations.length > 0);

function isSectionOpen(section: OperationPanelSection) {
  return openSections.value.has(section);
}

function toggleSection(section: OperationPanelSection) {
  const next = new Set(openSections.value);
  if (next.has(section)) {
    next.delete(section);
  } else {
    next.add(section);
  }
  openSections.value = next;
}

function commitWorkingOperations() {
  const commitAction = mapDocumentStore.commitWorkingOperations;
  if (typeof commitAction !== 'function') {
    return;
  }

  commitAction();
  openSections.value = new Set([...openSections.value, 'commits']);
}

function undoWorkingOperation() {
  mapDocumentStore.undoWorkingOperation();
  openSections.value = new Set([...openSections.value, 'working']);
}

function redoWorkingOperation() {
  mapDocumentStore.redoWorkingOperation();
  openSections.value = new Set([...openSections.value, 'working']);
}

function matchExternalOperations() {
  mapDocumentStore.matchExternalOperations();
  openSections.value = new Set([...openSections.value, 'external']);
}

function applyExternalOperation(recordId: string) {
  mapDocumentStore.applyExternalOperation(recordId);
  openSections.value = new Set([...openSections.value, 'external', 'working']);
}

function matchExternalOperation(recordId: string) {
  mapDocumentStore.matchExternalOperation(recordId);
  openSections.value = new Set([...openSections.value, 'external']);
}

function clearExternalOperations() {
  mapDocumentStore.clearExternalOperations();
  openSections.value = new Set([...openSections.value, 'external']);
}
</script>

<template>
  <div class="operation-history-panel">
    <section class="operation-section" :class="{ 'is-collapsed-panel': !isSectionOpen('summary') }">
      <div class="operation-section-head">
        <button class="operation-section-toggle" type="button" @click="toggleSection('summary')">
          <span class="panel-chevron">{{ isSectionOpen('summary') ? '▾' : '▸' }}</span>
          <h4>版本摘要</h4>
        </button>
        <span>本地记录</span>
      </div>

      <div v-if="isSectionOpen('summary')" class="detail-card">
        <div class="detail-body">
          <div class="detail-grid">
            <div class="detail-field">
              <span>未提交</span>
              <b>{{ editState.workingOperations.length }}</b>
            </div>
            <div class="detail-field">
              <span>可重做</span>
              <b>{{ editState.redoOperations.length }}</b>
            </div>
            <div class="detail-field">
              <span>本地提交</span>
              <b>{{ commits.length }}</b>
            </div>
            <div class="detail-field">
              <span>外部操作</span>
              <b>{{ externalOperations.length }}</b>
            </div>
            <div class="detail-field">
              <span>基础版本</span>
              <b>{{ editState.baseRevisionId ?? '无' }}</b>
            </div>
            <div class="detail-field">
              <span>远端版本</span>
              <b>{{ editState.remoteRevisionId ?? '无' }}</b>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="operation-section" :class="{ 'is-collapsed-panel': !isSectionOpen('working') }">
      <div class="operation-section-head">
        <button class="operation-section-toggle" type="button" @click="toggleSection('working')">
          <span class="panel-chevron">{{ isSectionOpen('working') ? '▾' : '▸' }}</span>
          <h4>未提交操作</h4>
        </button>
        <div class="operation-section-actions">
          <button
            class="text-action"
            type="button"
            :disabled="!canUndo"
            title="撤销最后一条未提交操作"
            @click="undoWorkingOperation"
          >
            撤销
          </button>
          <button
            class="text-action"
            type="button"
            :disabled="!canRedo"
            title="重做最后一条已撤销操作"
            @click="redoWorkingOperation"
          >
            重做
          </button>
          <button
            class="text-action"
            type="button"
            :disabled="!canCommit"
            :title="hasCommitAction ? '提交当前未提交操作' : '刷新页面后可用'"
            @click="commitWorkingOperations"
          >
            提交为 commit
          </button>
          <span>已执行 {{ workingOperations.length }} · 可重做 {{ redoOperations.length }}</span>
        </div>
      </div>

      <OperationStack
        v-if="isSectionOpen('working')"
        :working-operations="workingOperations"
        :redo-operations="redoOperations"
        :total-stack-operations="totalStackOperations"
      />
    </section>

    <section class="operation-section" :class="{ 'is-collapsed-panel': !isSectionOpen('external') }">
      <div class="operation-section-head">
        <button class="operation-section-toggle" type="button" @click="toggleSection('external')">
          <span class="panel-chevron">{{ isSectionOpen('external') ? '▾' : '▸' }}</span>
          <h4>外部操作</h4>
        </button>
        <div class="operation-section-actions">
          <button
            class="text-action"
            type="button"
            :disabled="!externalOperations.length"
            title="把外部操作和地图实际生成的内部操作重新匹配"
            @click="matchExternalOperations"
          >
            匹配
          </button>
          <button
            class="text-action"
            type="button"
            :disabled="!externalOperations.length"
            title="清空外部操作记录"
            @click="clearExternalOperations"
          >
            清空
          </button>
          <span>待匹配 {{ pendingExternalOperations.length }} · 总数 {{ externalOperations.length }}</span>
        </div>
      </div>

      <div v-if="isSectionOpen('external') && externalOperations.length" class="operation-list">
        <ExternalOperationCard
          v-for="record in externalOperations"
          :key="record.id"
          :record="record"
          @apply="applyExternalOperation"
          @match="matchExternalOperation"
        />
      </div>

      <div v-else-if="isSectionOpen('external')" class="empty-state compact">
        <b>暂无外部操作</b>
        <span>AI、后端或文件导入给出的操作意图会先放在这里，匹配成功后才和内部历史对上。</span>
      </div>
    </section>

    <section class="operation-section" :class="{ 'is-collapsed-panel': !isSectionOpen('commits') }">
      <div class="operation-section-head">
        <button class="operation-section-toggle" type="button" @click="toggleSection('commits')">
          <span class="panel-chevron">{{ isSectionOpen('commits') ? '▾' : '▸' }}</span>
          <h4>本地提交</h4>
        </button>
        <span>{{ commits.length }}</span>
      </div>

      <div v-if="isSectionOpen('commits') && commits.length" class="operation-list">
        <CommitCard
          v-for="commit in commits"
          :key="commit.id"
          :commit="commit"
        />
      </div>

      <div v-else-if="isSectionOpen('commits')" class="empty-state compact">
        <b>暂无提交</b>
        <span>后面确认保存/提交流程后，这里会显示本地 commit。</span>
      </div>
    </section>
  </div>
</template>
