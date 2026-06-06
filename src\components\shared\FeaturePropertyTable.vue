<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMapDocumentStore, type MapFeature, type MapLayer } from '../../stores/mapDocumentStore';
import ConfirmActionDialog from './ConfirmActionDialog.vue';

const props = defineProps<{
  layer: MapLayer;
  feature: MapFeature;
}>();

const mapDocumentStore = useMapDocumentStore();
const newPropertyKey = ref('');
const newPropertyValue = ref('');
const deleteFeatureDialogOpen = ref(false);

const featureName = computed(() => {
  const properties = props.feature.geojson.properties;
  return properties && typeof properties.name === 'string'
    ? properties.name
    : props.feature.id;
});

const properties = computed(() => getProperties());
const propertyEntries = computed(() => Object.entries(properties.value));
const propertyCount = computed(() => propertyEntries.value.length);
const featureSummary = computed(() => [
  { label: '要素名称', value: featureName.value },
  { label: '所属图层', value: props.layer.name },
  { label: 'GeoJSON 类型', value: props.feature.geojson.geometry.type },
  { label: '属性数量', value: propertyCount.value }
]);
const deleteFeatureDescription = computed(() => `删除要素「${featureName.value}」？`);

function getProperties() {
  return {
    ...(props.feature.geojson.properties ?? {})
  } as Record<string, unknown>;
}

function updateProperties(nextProperties: Record<string, unknown>) {
  mapDocumentStore.updateFeatureProperties({
    featureId: props.feature.id,
    properties: nextProperties
  });
}

function stringifyPropertyValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parsePropertyValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function updatePropertyKey(oldKey: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const nextKey = input.value.trim();
  const nextProperties = getProperties();

  if (!nextKey || (nextKey !== oldKey && Object.prototype.hasOwnProperty.call(nextProperties, nextKey))) {
    input.value = oldKey;
    return;
  }

  if (nextKey === oldKey) {
    return;
  }

  const value = nextProperties[oldKey];
  delete nextProperties[oldKey];
  nextProperties[nextKey] = value;
  updateProperties(nextProperties);
}

function updatePropertyValue(key: string, event: Event) {
  const input = event.target as HTMLInputElement;
  updateProperties({
    ...getProperties(),
    [key]: parsePropertyValue(input.value)
  });
}

function deleteProperty(key: string) {
  const nextProperties = getProperties();
  delete nextProperties[key];
  updateProperties(nextProperties);
}

function addProperty() {
  const key = newPropertyKey.value.trim();
  if (!key || Object.prototype.hasOwnProperty.call(properties.value, key)) {
    return;
  }

  updateProperties({
    ...getProperties(),
    [key]: parsePropertyValue(newPropertyValue.value)
  });
  newPropertyKey.value = '';
  newPropertyValue.value = '';
}

function openDeleteFeatureDialog() {
  deleteFeatureDialogOpen.value = true;
}

function confirmDeleteFeature() {
  mapDocumentStore.deleteFeature(props.feature.id);
}

</script>

<template>
  <section class="detail-card feature-property-card">
    <div class="detail-body">
      <div class="detail-grid">
        <div class="detail-field">
          <span>名称</span>
          <b>{{ featureName }}</b>
        </div>
        <div class="detail-field">
          <span>GeoJSON 类型</span>
          <b>{{ feature.geojson.geometry.type }}</b>
        </div>
        <div class="detail-field">
          <span>所属图层</span>
          <b>{{ layer.name }}</b>
        </div>
        <div class="detail-field">
          <span>属性数量</span>
          <b>{{ propertyCount }}</b>
        </div>
      </div>

      <div class="property-table">
        <div class="property-row property-head">
          <span>键</span>
          <span>值</span>
          <span></span>
        </div>

        <div
          v-for="([key, value], index) in propertyEntries"
          :key="key"
          class="property-row"
        >
          <input
            :id="`feature-property-key-${feature.id}-${index}`"
            :name="`featurePropertyKey-${feature.id}-${index}`"
            :value="key"
            type="text"
            autocomplete="off"
            @change="updatePropertyKey(key, $event)"
          >
          <input
            :id="`feature-property-value-${feature.id}-${index}`"
            :name="`featurePropertyValue-${feature.id}-${index}`"
            :value="stringifyPropertyValue(value)"
            type="text"
            autocomplete="off"
            @change="updatePropertyValue(key, $event)"
          >
          <button
            class="property-action-button danger"
            type="button"
            title="删除属性"
            @click="deleteProperty(key)"
          >
            删
          </button>
        </div>

        <div class="property-row property-add-row">
          <input
            :id="`feature-property-new-key-${feature.id}`"
            v-model="newPropertyKey"
            :name="`featurePropertyNewKey-${feature.id}`"
            type="text"
            placeholder="新键"
            autocomplete="off"
          >
          <input
            :id="`feature-property-new-value-${feature.id}`"
            v-model="newPropertyValue"
            :name="`featurePropertyNewValue-${feature.id}`"
            type="text"
            placeholder="新值"
            autocomplete="off"
            @keyup.enter="addProperty"
          >
          <button class="property-action-button" type="button" title="新增属性" @click="addProperty">
            加
          </button>
        </div>
      </div>

      <div class="feature-property-actions">
        <button class="button danger" type="button" @click="openDeleteFeatureDialog">
          删除要素
        </button>
      </div>
    </div>
  </section>

  <ConfirmActionDialog
    v-model:open="deleteFeatureDialogOpen"
    dialog-id="delete-feature-dialog"
    title="删除要素"
    :description="deleteFeatureDescription"
    :summary-rows="featureSummary"
    confirm-text="删除"
    danger
    @confirm="confirmDeleteFeature"
  />
</template>
