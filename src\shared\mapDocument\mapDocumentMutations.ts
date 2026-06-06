import type { Feature as GeoJsonFeature } from 'geojson';
import type { MapFeature, MapLayer } from '../../schemas/mapDocumentSchema';
import {
  AddFeatureInputSchema,
  CreateLayerInputSchema,
  createDocumentEntityId,
  RenameFeatureInputSchema,
  RenameLayerInputSchema,
  SetLayerVisibleInputSchema,
  UpdateFeatureGeometryInputSchema,
  UpdateFeaturePropertiesInputSchema,
  validateMapDocument,
  type AddFeatureInput,
  type CreateLayerInput,
  type MapDocumentLike,
  type RenameFeatureInput,
  type RenameLayerInput,
  type SetLayerVisibleInput,
  type UpdateFeatureGeometryInput,
  type UpdateFeaturePropertiesInput
} from './mapDocumentValidation';

function nextLayerOrder(layers: MapLayer[]) {
  return layers.length ? Math.max(...layers.map((layer) => layer.order)) + 1 : 0;
}

export function createLayer<T extends MapDocumentLike>(document: T, input: CreateLayerInput = {}): T {
  const parsed = CreateLayerInputSchema.parse(input);
  const id = parsed.id ?? createDocumentEntityId('layer');

  if (document.layers.some((layer) => layer.id === id)) {
    throw new Error(`Layer already exists: ${id}`);
  }

  const nextLayer: MapLayer = {
    id,
    name: parsed.name ?? '新建图层',
    role: parsed.role,
    geometryType: parsed.geometryType,
    visible: parsed.visible,
    locked: parsed.locked,
    order: parsed.order ?? nextLayerOrder(document.layers),
    featureIds: [],
    style: parsed.style,
    imageResources: []
  };

  return validateMapDocument({
    ...document,
    layers: [...document.layers, nextLayer],
    selectedLayerId: nextLayer.id,
    selectedFeatureId: null
  });
}

export function renameLayer<T extends MapDocumentLike>(document: T, input: RenameLayerInput): T {
  const parsed = RenameLayerInputSchema.parse(input);

  return validateMapDocument({
    ...document,
    layers: document.layers.map((layer) => (
      layer.id === parsed.layerId
        ? { ...layer, name: parsed.name }
        : layer
    ))
  });
}

export function addFeature<T extends MapDocumentLike>(document: T, input: AddFeatureInput): T {
  const parsed = AddFeatureInputSchema.parse(input);
  const targetLayer = document.layers.find((layer) => layer.id === parsed.layerId);

  if (!targetLayer) {
    throw new Error(`Layer does not exist: ${parsed.layerId}`);
  }

  const id = parsed.id ?? createDocumentEntityId('feature');
  if (document.features[id]) {
    throw new Error(`Feature already exists: ${id}`);
  }

  const nextFeature: MapFeature = {
    id,
    layerId: parsed.layerId,
    geojson: parsed.geojson,
    imageResourceId: parsed.imageResourceId ?? null
  };

  return validateMapDocument({
    ...document,
    features: {
      ...document.features,
      [nextFeature.id]: nextFeature
    },
    layers: document.layers.map((layer) => (
      layer.id === parsed.layerId
        ? { ...layer, featureIds: [...new Set([...layer.featureIds, nextFeature.id])] }
        : layer
    )),
    selectedLayerId: parsed.layerId,
    selectedFeatureId: nextFeature.id
  });
}

export function updateFeatureProperties<T extends MapDocumentLike>(
  document: T,
  input: UpdateFeaturePropertiesInput
): T {
  const parsed = UpdateFeaturePropertiesInputSchema.parse(input);
  const feature = document.features[parsed.featureId];

  if (!feature) {
    throw new Error(`Feature does not exist: ${parsed.featureId}`);
  }

  const nextGeojson: GeoJsonFeature = {
    ...feature.geojson,
    properties: parsed.properties
  };

  return validateMapDocument({
    ...document,
    features: {
      ...document.features,
      [feature.id]: {
        ...feature,
        geojson: nextGeojson
      }
    }
  });
}

export function updateFeatureGeometry<T extends MapDocumentLike>(
  document: T,
  input: UpdateFeatureGeometryInput
): T {
  const parsed = UpdateFeatureGeometryInputSchema.parse(input);
  const feature = document.features[parsed.featureId];

  if (!feature) {
    throw new Error(`Feature does not exist: ${parsed.featureId}`);
  }

  return validateMapDocument({
    ...document,
    features: {
      ...document.features,
      [feature.id]: {
        ...feature,
        geojson: parsed.geojson,
        imageResourceId: parsed.imageResourceId === undefined
          ? feature.imageResourceId
          : parsed.imageResourceId
      }
    }
  });
}

export function renameFeature<T extends MapDocumentLike>(document: T, input: RenameFeatureInput): T {
  const parsed = RenameFeatureInputSchema.parse(input);
  const feature = document.features[parsed.featureId];

  if (!feature) {
    throw new Error(`Feature does not exist: ${parsed.featureId}`);
  }

  return updateFeatureProperties(document, {
    featureId: parsed.featureId,
    properties: {
      ...(feature.geojson.properties ?? {}),
      name: parsed.name
    }
  });
}

export function selectLayer<T extends MapDocumentLike>(document: T, layerId: string | null): T {
  const nextLayerId = layerId && document.layers.some((layer) => layer.id === layerId)
    ? layerId
    : null;
  const selectedFeature = document.selectedFeatureId
    ? document.features[document.selectedFeatureId]
    : null;
  const shouldKeepSelectedFeature = Boolean(
    selectedFeature
      && nextLayerId
      && selectedFeature.layerId === nextLayerId
  );

  return validateMapDocument({
    ...document,
    selectedLayerId: nextLayerId,
    selectedFeatureId: shouldKeepSelectedFeature ? document.selectedFeatureId : null
  });
}

export function selectFeature<T extends MapDocumentLike>(document: T, featureId: string | null): T {
  const nextFeature = featureId ? document.features[featureId] : null;
  const nextLayerExists = nextFeature
    ? document.layers.some((layer) => layer.id === nextFeature.layerId)
    : false;

  return validateMapDocument({
    ...document,
    selectedLayerId: nextFeature && nextLayerExists ? nextFeature.layerId : document.selectedLayerId,
    selectedFeatureId: nextFeature ? nextFeature.id : null
  });
}

export function reorderLayers<T extends MapDocumentLike>(document: T, layerIds: string[]): T {
  const knownLayerIds = new Set(document.layers.map((layer) => layer.id));
  if (!layerIds.every((layerId) => knownLayerIds.has(layerId))) {
    return document;
  }

  const targetLayerIds = new Set(layerIds);
  const orderSlots = document.layers
    .filter((layer) => targetLayerIds.has(layer.id))
    .map((layer) => layer.order)
    .sort((a, b) => a - b);
  const nextOrderById = new Map(layerIds.map((layerId, index) => [layerId, orderSlots[index]]));

  return validateMapDocument({
    ...document,
    layers: document.layers.map((layer) => ({
      ...layer,
      order: nextOrderById.get(layer.id) ?? layer.order
    }))
  });
}

export function setLayerVisible<T extends MapDocumentLike>(document: T, input: SetLayerVisibleInput): T {
  const parsed = SetLayerVisibleInputSchema.parse(input);
  if (!document.layers.some((layer) => layer.id === parsed.layerId)) {
    return document;
  }

  const selectedFeature = document.selectedFeatureId
    ? document.features[document.selectedFeatureId]
    : null;
  const shouldClearSelectedFeature = Boolean(
    !parsed.visible
      && selectedFeature
      && selectedFeature.layerId === parsed.layerId
  );

  return validateMapDocument({
    ...document,
    selectedLayerId: !parsed.visible && document.selectedLayerId === parsed.layerId
      ? null
      : document.selectedLayerId,
    selectedFeatureId: shouldClearSelectedFeature ? null : document.selectedFeatureId,
    layers: document.layers.map((layer) => (
      layer.id === parsed.layerId
        ? { ...layer, visible: parsed.visible }
        : layer
    ))
  });
}
