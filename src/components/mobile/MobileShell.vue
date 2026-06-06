<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MobileEditMode, MobileTab } from '../../types';
import PlaceholderBlock from '../shared/PlaceholderBlock.vue';
import MobileBottomNav from './MobileBottomNav.vue';

const activeTab = ref<MobileTab>('map');
const activeAssist = ref<'search' | 'ai'>('search');
const activeEditMode = ref<MobileEditMode>('manual');
const quickTool = ref('');

const title = computed(() => {
  if (activeTab.value === 'map') return '地图';
  if (activeTab.value === 'info') return '信息';
  if (activeTab.value === 'edit') return '编辑';
  return '我的';
});

const editModes: Array<{ id: MobileEditMode; label: string }> = [
  { id: 'manual', label: '手动' },
  { id: 'agent', label: 'AI 代编辑' },
  { id: 'preview', label: '预览' }
];

function toggleQuickTool(tool: string) {
  quickTool.value = quickTool.value === tool ? '' : tool;
}
</script>

<template>
  <main class="mobile-shell">
    <section v-if="activeTab === 'map'" class="mobile-screen">
      <header class="mobile-topbar">
        <button class="mobile-icon-button" type="button">‹</button>
        <div class="mobile-title">
          <b>{{ title }}</b>
          <span>空状态布局</span>
        </div>
        <button class="mobile-icon-button" type="button">+</button>
      </header>

      <section class="mobile-map-stage">
        <div class="mobile-map-canvas">
          <div class="mobile-map-label">
            <span>地图画布区域</span>
            <span>{{ quickTool || '未选择工具' }}</span>
            <span>不放 mock 地理数据</span>
          </div>
        </div>

        <div class="mobile-quick-tools">
          <button
            v-for="tool in ['图层', '提醒', '导入']"
            :key="tool"
            class="mobile-pill"
            :class="{ active: quickTool === tool }"
            type="button"
            @click="toggleQuickTool(tool)"
          >
            {{ tool }}
          </button>
        </div>

        <section class="mobile-assist">
          <div class="mobile-segmented">
            <button
              class="mobile-segment"
              :class="{ active: activeAssist === 'search' }"
              type="button"
              @click="activeAssist = 'search'"
            >
              搜索
            </button>
            <button
              class="mobile-segment"
              :class="{ active: activeAssist === 'ai' }"
              type="button"
              @click="activeAssist = 'ai'"
            >
              AI
            </button>
          </div>
          <PlaceholderBlock kind="field" />
        </section>
      </section>
    </section>

    <section v-else-if="activeTab === 'edit'" class="mobile-screen mobile-edit-screen">
      <header class="mobile-topbar dark">
        <div class="mobile-title">
          <b>{{ title }}</b>
          <span>空状态布局</span>
        </div>
        <button class="button primary" type="button">保存</button>
      </header>

      <section class="mobile-edit-map">
        <div class="mobile-map-label">
          <span>编辑地图预览</span>
          <span>不放 mock 地理数据</span>
        </div>
      </section>

      <section class="mobile-edit-panel">
        <div class="mobile-segmented">
          <button
            v-for="mode in editModes"
            :key="mode.id"
            class="mobile-segment"
            :class="{ active: activeEditMode === mode.id }"
            type="button"
            @click="activeEditMode = mode.id"
          >
            {{ mode.label }}
          </button>
        </div>
        <PlaceholderBlock kind="composer" />
        <div class="mobile-edit-actions">
          <button class="button" type="button">清空</button>
          <button class="button primary" type="button">运行</button>
        </div>
        <PlaceholderBlock kind="block" />
      </section>
    </section>

    <section v-else class="mobile-screen">
      <header class="mobile-topbar">
        <div class="mobile-title">
          <b>{{ title }}</b>
          <span>空状态布局</span>
        </div>
      </header>
      <section class="mobile-scroll">
        <section class="mobile-card">
          <div class="panel-head">
            <h3>{{ activeTab === 'info' ? '提醒' : '账户' }}</h3>
            <span>空组件</span>
          </div>
          <div class="panel-body empty-stack">
            <PlaceholderBlock />
            <PlaceholderBlock />
            <PlaceholderBlock />
          </div>
        </section>
        <section class="mobile-card">
          <div class="panel-head">
            <h3>{{ activeTab === 'info' ? '地图说明' : '配置' }}</h3>
            <span>空组件</span>
          </div>
          <div class="panel-body">
            <PlaceholderBlock kind="block" />
          </div>
        </section>
      </section>
    </section>

    <MobileBottomNav v-model:active-tab="activeTab" />
  </main>
</template>
