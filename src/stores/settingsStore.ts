import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

const STORAGE_KEY = 'agentgis:v9_3:settings';

export type SettingsState = {
  byokEnabled: boolean;
  amapBaseMap: {
    jsKey: string;
    securityCode: string;
  };
  amapPoi: {
    webServiceKey: string;
  };
  llm: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
};

export const DEFAULT_SETTINGS: SettingsState = {
  byokEnabled: false,
  amapBaseMap: {
    jsKey: '',
    securityCode: ''
  },
  amapPoi: {
    webServiceKey: ''
  },
  llm: {
    baseUrl: '',
    apiKey: '',
    model: ''
  }
};

export function cloneSettings(settings: SettingsState = DEFAULT_SETTINGS): SettingsState {
  return {
    byokEnabled: Boolean(settings.byokEnabled),
    amapBaseMap: {
      jsKey: settings.amapBaseMap?.jsKey || '',
      securityCode: settings.amapBaseMap?.securityCode || ''
    },
    amapPoi: {
      webServiceKey: settings.amapPoi?.webServiceKey || ''
    },
    llm: {
      baseUrl: settings.llm?.baseUrl || '',
      apiKey: settings.llm?.apiKey || '',
      model: settings.llm?.model || ''
    }
  };
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function loadStoredSettings() {
  if (!canUseLocalStorage()) {
    return cloneSettings();
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return cloneSettings(saved ? JSON.parse(saved) : DEFAULT_SETTINGS);
  } catch {
    return cloneSettings();
  }
}

function persistSettings(settings: SettingsState) {
  if (!canUseLocalStorage()) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<SettingsState>(loadStoredSettings());

  const hasAmapBaseMapCredentials = computed(() => Boolean(
    settings.value.byokEnabled
      && settings.value.amapBaseMap.jsKey
      && settings.value.amapBaseMap.securityCode
  ));

  function saveSettings(nextSettings: SettingsState) {
    settings.value = cloneSettings(nextSettings);
    persistSettings(settings.value);
  }

  function resetSettings() {
    settings.value = cloneSettings();
    if (canUseLocalStorage()) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  return {
    settings,
    hasAmapBaseMapCredentials,
    saveSettings,
    resetSettings
  };
});
