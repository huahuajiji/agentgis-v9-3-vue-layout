<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { LayerGeometryType, LayerRole } from '../../stores/mapDocumentStore';

const open = defineModel<boolean>('open', { required: true });

const props = defineProps<{
  role: LayerRole;
}>();

const emit = defineEmits<{
  confirm: [input: { name: string; geometryType: LayerGeometryType }];
}>();

const geometryOptions: Array<{ value: LayerGeometryType; label: string }> = [
  { value: 'point', label: '点' },
  { value: 'line', label: '线' },
  { value: 'polygon', label: '面' },
  { value: 'mixed', label: '混合' }
];

const layerName = ref('');
const geometryType = ref<LayerGeometryType>('mixed');
const errorMessage = ref('');

const roleLabel = computed(() => (props.role === 'reference' ? '参考图层' : '正式图层'));
const defaultLayerName = computed(() => (props.role === 'reference' ? '新建参考图层' : '新建正式图层'));

function closeDialog() {
  open.value = false;
}

function submitDialog() {
  const name = layerName.value.trim();
  if (!name) {
    errorMessage.value = '请输入图层名称';
    return;
  }

  emit('confirm', {
    name,
    geometryType: geometryType.value
  });
  closeDialog();
}

watch(
  open,
  (isOpen) => {
    if (!isOpen) {
      return;
    }

    layerName.value = defaultLayerName.value;
    geometryType.value = 'mixed';
    errorMessage.value = '';
  }
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="closeDialog">
      <section class="draft-save-modal" role="dialog" aria-modal="true" aria-labelledby="create-layer-dialog-title">
        <header class="modal-head">
          <div>
            <h2 id="create-layer-dialog-title">新建图层</h2>
            <span>创建到当前{{ roleLabel }}列表中。</span>
          </div>
          <button class="icon-button" type="button" aria-label="关闭新建图层弹窗" @click="closeDialog">×</button>
        </header>

        <div class="modal-body">
          <form class="dialog-body" @submit.prevent="submitDialog">
            <section class="detail-card">
              <div class="detail-body">
                <div class="detail-grid">
                  <div class="detail-field">
                    <span>图层归属</span>
                    <b>{{ roleLabel }}</b>
                  </div>
                </div>
              </div>
            </section>

            <label class="setting-field" for="create-layer-name">
              <span>图层名称</span>
              <input
                id="create-layer-name"
                v-model="layerName"
                name="createLayerName"
                type="text"
                placeholder="请输入图层名称"
                autocomplete="off"
              >
            </label>

            <label class="setting-field" for="create-layer-geometry-type">
              <span>图层类型</span>
              <select
                id="create-layer-geometry-type"
                v-model="geometryType"
                name="createLayerGeometryType"
              >
                <option v-for="option in geometryOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <p v-if="errorMessage" class="transfer-message error">{{ errorMessage }}</p>

            <div class="draft-save-actions">
              <button class="button" type="button" @click="closeDialog">取消</button>
              <button class="button primary" type="submit">新建</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  </Teleport>
</template>
