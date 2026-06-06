<script setup lang="ts">
import { ref, watch } from 'vue';

type SummaryRow = {
  label: string;
  value: string | number;
};

const open = defineModel<boolean>('open', { required: true });

const props = withDefaults(defineProps<{
  dialogId: string;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmText?: string;
  summaryRows?: SummaryRow[];
}>(), {
  description: '',
  placeholder: '',
  initialValue: '',
  confirmText: '确认',
  summaryRows: () => []
});

const emit = defineEmits<{
  confirm: [value: string];
}>();

const inputValue = ref('');
const errorMessage = ref('');

function closeDialog() {
  open.value = false;
}

function submitDialog() {
  const value = inputValue.value.trim();
  if (!value) {
    errorMessage.value = `请输入${props.label}`;
    return;
  }

  emit('confirm', value);
  closeDialog();
}

watch(
  open,
  (isOpen) => {
    if (!isOpen) {
      return;
    }

    inputValue.value = props.initialValue;
    errorMessage.value = '';
  }
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="closeDialog">
      <section class="draft-save-modal" role="dialog" aria-modal="true" :aria-labelledby="`${dialogId}-title`">
        <header class="modal-head">
          <div>
            <h2 :id="`${dialogId}-title`">{{ title }}</h2>
            <span v-if="description">{{ description }}</span>
          </div>
          <button class="icon-button" type="button" :aria-label="`关闭${title}弹窗`" @click="closeDialog">×</button>
        </header>

        <div class="modal-body">
          <form class="dialog-body" @submit.prevent="submitDialog">
            <section v-if="summaryRows.length" class="detail-card">
              <div class="detail-body">
                <div class="detail-grid">
                  <div v-for="row in summaryRows" :key="row.label" class="detail-field">
                    <span>{{ row.label }}</span>
                    <b>{{ row.value }}</b>
                  </div>
                </div>
              </div>
            </section>

            <label class="setting-field" :for="`${dialogId}-input`">
              <span>{{ label }}</span>
              <input
                :id="`${dialogId}-input`"
                v-model="inputValue"
                :name="`${dialogId}Input`"
                type="text"
                :placeholder="placeholder"
                autocomplete="off"
              >
            </label>

            <p v-if="errorMessage" class="transfer-message error">{{ errorMessage }}</p>

            <div class="draft-save-actions">
              <button class="button" type="button" @click="closeDialog">取消</button>
              <button class="button primary" type="submit">{{ confirmText }}</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  </Teleport>
</template>
