<script setup lang="ts">
import type { MapAction } from '../types';

const mapAction = defineModel<MapAction>('mapAction', { required: true });

const mapActions: Exclude<MapAction, ''>[] = ['定位', '放大', '缩小'];

function setMapAction(nextAction: Exclude<MapAction, ''>) {
  mapAction.value = nextAction;
}
</script>

<template>
  <div class="map-float">
    <button
      v-for="item in mapActions"
      :key="item"
      class="icon-button"
      :class="{ active: mapAction === item }"
      type="button"
      @click="setMapAction(item)"
    >
      {{ item === '定位' ? '⌖' : item === '放大' ? '+' : '−' }}
    </button>
  </div>
</template>
