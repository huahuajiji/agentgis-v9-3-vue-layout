<script setup lang="ts">
import { ref } from 'vue';
import AccountModal from './AccountModal.vue';
import AppNavRail from './AppNavRail.vue';
import WorkspaceSidebar from './WorkspaceSidebar.vue';
import type { NavSection } from '../types';

defineProps<{
  activeSection: NavSection;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  selectSection: [section: NavSection];
}>();

const accountModalOpen = ref(false);
</script>

<template>
  <section class="desktop-left-pane">
    <AppNavRail
      :active-section="activeSection"
      :account-open="accountModalOpen"
      @select-section="emit('selectSection', $event)"
      @open-account="accountModalOpen = true"
    />

    <WorkspaceSidebar
      :active-section="activeSection"
      :collapsed="collapsed"
    />
  </section>

  <AccountModal :open="accountModalOpen" @close="accountModalOpen = false" />
</template>
