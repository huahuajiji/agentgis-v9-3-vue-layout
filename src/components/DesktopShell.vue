<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DesktopLeftPane from './DesktopLeftPane.vue';
import DesktopMainArea from './DesktopMainArea.vue';
import WorkspaceHeadActions from './WorkspaceHeadActions.vue';
import type { NavSection } from '../types';

const route = useRoute();
const router = useRouter();
const sidebarCollapsed = ref(false);
const inspectorCollapsed = ref(false);

const sectionRoutes: Record<NavSection, string> = {
  地图: '/map',
  项目: '/project',
  数据: '/data',
  AI: '/ai',
  历史: '/history',
  设置: '/settings'
};

const activeNav = computed<NavSection>(() => {
  const section = route.meta.section;
  return isNavSection(section) ? section : '地图';
});

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

function toggleInspector() {
  inspectorCollapsed.value = !inspectorCollapsed.value;
}

function isNavSection(section: unknown): section is NavSection {
  return typeof section === 'string' && section in sectionRoutes;
}

async function selectSection(section: NavSection) {
  await router.push(sectionRoutes[section]);
}
</script>

<template>
  <main
    class="shell desktop-shell"
    :class="{ 'is-sidebar-collapsed': sidebarCollapsed }"
  >
    <DesktopLeftPane
      :active-section="activeNav"
      :collapsed="sidebarCollapsed"
      @select-section="selectSection"
    />

    <DesktopMainArea
      :active-section="activeNav"
      :inspector-collapsed="inspectorCollapsed"
    >
      <template #head-actions>
        <WorkspaceHeadActions
          @toggle-sidebar="toggleSidebar"
          @toggle-inspector="toggleInspector"
        />
      </template>
    </DesktopMainArea>
  </main>
</template>
