<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { cloneSettings, useSettingsStore, type SettingsState } from '../stores/settingsStore';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

type AccountSection = 'identity' | 'workspace' | 'byok';

const openSections = ref<Set<AccountSection>>(new Set(['identity', 'workspace', 'byok']));
const settingsStore = useSettingsStore();
const form = reactive<SettingsState>(cloneSettings(settingsStore.settings));

function isSectionOpen(section: AccountSection) {
  return openSections.value.has(section);
}

function toggleSection(section: AccountSection) {
  const next = new Set(openSections.value);
  if (next.has(section)) {
    next.delete(section);
  } else {
    next.add(section);
  }
  openSections.value = next;
}

function resetForm() {
  const next = cloneSettings(settingsStore.settings);
  form.byokEnabled = next.byokEnabled;
  form.amapBaseMap = next.amapBaseMap;
  form.amapPoi = next.amapPoi;
  form.llm = next.llm;
}

function saveByokSettings() {
  settingsStore.saveSettings(form);
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resetForm();
    }
  }
);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
      <section class="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
        <header class="modal-head">
          <div>
            <h2 id="account-modal-title">账户</h2>
            <span>账户、工作区与服务设置</span>
          </div>
          <button class="icon-button" type="button" aria-label="关闭账户弹窗" @click="emit('close')">×</button>
        </header>
        <div class="modal-body">
          <div class="account-body">
            <section class="account-section" :class="{ 'is-collapsed-panel': !isSectionOpen('identity') }">
              <button class="account-section-head collapsible-panel-head" type="button" @click="toggleSection('identity')">
                <span class="panel-chevron">{{ isSectionOpen('identity') ? '▾' : '▸' }}</span>
                <h3>身份</h3>
                <span>空状态</span>
              </button>
              <div v-if="isSectionOpen('identity')" class="account-identity-body">
                <div class="avatar-placeholder"></div>
                <div class="identity-placeholder">
                  <div class="placeholder placeholder-row"></div>
                  <div class="placeholder placeholder-row"></div>
                </div>
              </div>
            </section>

            <section class="account-section" :class="{ 'is-collapsed-panel': !isSectionOpen('workspace') }">
              <button class="account-section-head collapsible-panel-head" type="button" @click="toggleSection('workspace')">
                <span class="panel-chevron">{{ isSectionOpen('workspace') ? '▾' : '▸' }}</span>
                <h3>工作区</h3>
                <span>空状态</span>
              </button>
              <div v-if="isSectionOpen('workspace')" class="account-actions-row account-section-body">
                <button class="button" type="button">切换</button>
                <button class="button" type="button">设置工作区</button>
              </div>
            </section>

            <section class="account-section byok-section" :class="{ 'is-collapsed-panel': !isSectionOpen('byok') }">
              <button class="account-section-head collapsible-panel-head" type="button" @click="toggleSection('byok')">
                <span class="panel-chevron">{{ isSectionOpen('byok') ? '▾' : '▸' }}</span>
                <h3>BYOK 配置</h3>
                <span>本地保存</span>
              </button>
              <div v-if="isSectionOpen('byok')" class="account-section-body">
                <label class="setting-row" for="byok-enabled">
                  <span>启用自有密钥</span>
                  <input id="byok-enabled" v-model="form.byokEnabled" name="byokEnabled" type="checkbox">
                </label>

                <div class="byok-group">
                  <h4>LLM</h4>
                  <label class="setting-field" for="llm-base-url">
                    <span>Base URL</span>
                    <input id="llm-base-url" v-model="form.llm.baseUrl" name="llmBaseUrl" type="url" placeholder="https://.../v1" autocomplete="url">
                  </label>
                  <label class="setting-field" for="llm-api-key">
                    <span>API Key</span>
                    <input
                      id="llm-api-key"
                      v-model="form.llm.apiKey"
                      class="secret-input"
                      name="agentgisLlmToken"
                      type="text"
                      placeholder="sk-..."
                      autocomplete="off"
                      autocapitalize="off"
                      spellcheck="false"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-lpignore="true"
                    >
                  </label>
                  <label class="setting-field" for="llm-model">
                    <span>Model</span>
                    <input id="llm-model" v-model="form.llm.model" name="llmModel" type="text" placeholder="model name" autocomplete="off">
                  </label>
                </div>

                <div class="byok-group">
                  <h4>高德底图</h4>
                  <label class="setting-field" for="amap-js-key">
                    <span>AMap JS Key</span>
                    <input
                      id="amap-js-key"
                      v-model="form.amapBaseMap.jsKey"
                      class="secret-input"
                      name="agentgisAmapJsToken"
                      type="text"
                      placeholder="请输入 JS Key"
                      autocomplete="off"
                      autocapitalize="off"
                      spellcheck="false"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-lpignore="true"
                    >
                  </label>
                  <label class="setting-field" for="amap-security-code">
                    <span>AMap Security Code</span>
                    <input
                      id="amap-security-code"
                      v-model="form.amapBaseMap.securityCode"
                      class="secret-input"
                      name="agentgisAmapSecurityToken"
                      type="text"
                      placeholder="请输入 Security Code"
                      autocomplete="off"
                      autocapitalize="off"
                      spellcheck="false"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-lpignore="true"
                    >
                  </label>
                </div>

                <div class="byok-group">
                  <h4>高德 POI</h4>
                  <label class="setting-field" for="amap-web-service-key">
                    <span>AMap Web Service Key</span>
                    <input
                      id="amap-web-service-key"
                      v-model="form.amapPoi.webServiceKey"
                      class="secret-input"
                      name="agentgisAmapPoiToken"
                      type="text"
                      placeholder="请输入 Web Service Key"
                      autocomplete="off"
                      autocapitalize="off"
                      spellcheck="false"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-lpignore="true"
                    >
                  </label>
                </div>

                <div class="account-actions-row">
                  <button class="button" type="button">测试连接</button>
                  <button class="button primary" type="button" @click="saveByokSettings">保存到本地</button>
                </div>
              </div>
            </section>

            <footer class="account-footer">
              <button class="button danger" type="button">退出登录</button>
            </footer>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
