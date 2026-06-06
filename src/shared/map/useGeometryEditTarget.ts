import { computed, ref, watch, type Ref } from 'vue';
import { useMapDocumentStore } from '../../stores/mapDocumentStore';
import type { MapMode, MapTool } from '../../types';

export function useGeometryEditTarget(activeMode: Ref<MapMode>, activeTool: Ref<MapTool>) {
  const mapDocumentStore = useMapDocumentStore();
  const geometryEditFeatureId = ref<string | null>(null);

  const selectedFeatureId = computed(() => mapDocumentStore.activeDocument.selectedFeatureId);
  const activeDocumentKey = computed(() => {
    const activeRef = mapDocumentStore.activeDocumentRef;
    return activeRef.kind === 'saved' ? activeRef.id : 'draft';
  });

  watch(
    () => [
      activeMode.value,
      activeTool.value,
      selectedFeatureId.value,
      activeDocumentKey.value
    ],
    () => {
      const nextFeatureId = selectedFeatureId.value;
      if (activeMode.value !== '编辑' || activeTool.value !== '选择' || !nextFeatureId) {
        geometryEditFeatureId.value = null;
        return;
      }

      const feature = mapDocumentStore.activeDocument.features[nextFeatureId];
      const layer = feature
        ? mapDocumentStore.activeDocument.layers.find((item) => item.id === feature.layerId)
        : null;

      geometryEditFeatureId.value = feature && layer?.role === 'work' ? nextFeatureId : null;
    },
    { immediate: true }
  );

  return {
    geometryEditFeatureId
  };
}
