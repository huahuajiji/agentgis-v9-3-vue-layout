<script setup lang="ts">
type SummaryRow = {
  label: string;
  value: string | number;
};

const open = defineModel<boolean>('open', { required: true });

withDefaults(defineProps<{
  dialogId: string;
  title: string;
  description?: string;
  confirmText?: string;
  danger?: boolean;
  summaryRows?: SummaryRow[];
}>(), {
  description: '',
  confirmText: '确认',
  danger: false,
  summaryRows: () => []
});

const emit = defineEmits<{
  confirm: [];
}>();

function closeDialog() {
  open.value = false;
}

function confirmDialog() {
  emit('confirm');
  closeDialog();
}
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
          <div class="dialog-body">
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

            <div class="draft-save-actions">
              <button class="button" type="button" @click="closeDialog">取消</button>
              <button class="button" :class="danger ? 'danger' : 'primary'" type="button" @click="confirmDialog">
                {{ confirmText }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
