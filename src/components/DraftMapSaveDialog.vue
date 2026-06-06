<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMapDocumentStore, type SavedMapDocument } from '../stores/mapDocumentStore';

const open = defineModel<boolean>('open', { required: true });

const emit = defineEmits<{
  saved: [document: SavedMapDocument];
}>();

const mapDocumentStore = useMapDocumentStore();
const mapName = ref('');
const errorMessage = ref('');

const activeDocument = computed(() => mapDocumentStore.activeDocument);
const isDraft = computed(() => mapDocumentStore.activeDocumentRef.kind === 'draft');
const workLayerCount = computed(() => activeDocument.value.layers.filter((layer) => layer.role === 'work').length);
const referenceLayerCount = computed(() => activeDocument.value.layers.filter((layer) => layer.role === 'reference').length);
const featureCount = computed(() => Object.keys(activeDocument.value.features).length);

function closeDialog() {
  open.value = false;
}

function saveDraft() {
  const name = mapName.value.trim();
  if (!name) {
    errorMessage.value = '请输入地图名称';
    return;
  }

  try {
    const savedDocument = mapDocumentStore.saveDraftAsMap({ name });
    emit('saved', savedDocument);
    closeDialog();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败';
  }
}

watch(
  open,
  (isOpen) => {
    if (!isOpen) {
      return;
    }

    mapName.value = activeDocument.value.name === 'Draft map' ? '' : activeDocument.value.name;
    errorMessage.value = '';
  }
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="closeDialog">
      <section class="draft-save-modal" role="dialog" aria-modal="true" aria-labelledby="draft-save-title">
        <header class="modal-head">
          <div>
            <h2 id="draft-save-title">保存草稿地图</h2>
            <span>草稿会转为真实 MapDocument，并进入项目列表。</span>
          </div>
          <button class="icon-button" type="button" aria-label="关闭保存草稿弹窗" @click="closeDialog">×</button>
        </header>

        <div class="modal-body">
          <div class="draft-save-body">
            <section class="detail-card">
              <div class="detail-body">
                <div class="detail-grid">
                  <div class="detail-field">
                    <span>当前状态</span>
                    <b>{{ isDraft ? '草稿地图' : '真实地图' }}</b>
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

            <label class="setting-field" for="draft-map-name">
              <span>地图名称</span>
              <input
                id="draft-map-name"
                v-model="mapName"
                name="draftMapName"
                type="text"
                placeholder="请输入地图名称"
                autocomplete="off"
                @keyup.enter="saveDraft"
              >
            </label>

            <p v-if="errorMessage" class="transfer-message error">{{ errorMessage }}</p>

            <div class="draft-save-actions">
              <button class="button" type="button" @click="closeDialog">取消</button>
              <button class="button primary" type="button" :disabled="!isDraft" @click="saveDraft">保存</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
