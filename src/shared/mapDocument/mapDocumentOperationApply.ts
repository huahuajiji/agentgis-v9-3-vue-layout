import type {
  LocalMapCommit,
  MapFeature,
  MapLayer,
  MapOperation
} from '../../schemas/mapDocumentSchema';
import { validateMapDocument, type MapDocumentLike } from './mapDocumentValidation';
import { validateLocalMapCommit, validateMapOperation } from './mapDocumentEditValidation';

type Patch = Record<string, unknown>;

export function applyOperation<T extends MapDocumentLike>(document: T, operation: MapOperation): T {
  const parsedOperation = validateMapOperation(operation);

  if (parsedOperation.type === 'layer.create') {
    return upsertLayer(document, parsedOperation.after);
  }

  if (parsedOperation.type === 'layer.update') {
    return patchLayer(document, parsedOperation.layerId, parsedOperation.after);
  }

  if (parsedOperation.type === 'layer.delete') {
    return removeLayer(document, parsedOperation.layerId);
  }

  if (parsedOperation.type === 'feature.create') {
    return upsertFeature(document, parsedOperation.after);
  }

  if (parsedOperation.type === 'feature.update') {
    return patchFeature(document, parsedOperation.featureId, parsedOperation.after);
  }

  if (parsedOperation.type === 'feature.delete') {
    return removeFeature(document, parsedOperation.featureId);
  }

  return parsedOperation.layers.reduce(
    (nextDocument, layer) => upsertLayer(nextDocument, layer),
    parsedOperation.features.reduce(
      (nextDocument, feature) => upsertFeature(nextDocument, feature),
      document
    )
  );
}

export function applyOperations<T extends MapDocumentLike>(document: T, operations: MapOperation[]): T {
  return operations.reduce((nextDocument, operation) => (
    applyOperation(nextDocument, operation)
  ), document);
}

export function revertOperation<T extends MapDocumentLike>(document: T, operation: MapOperation): T {
  const parsedOperation = validateMapOperation(operation);

  if (parsedOperation.type === 'layer.create') {
    return removeLayer(document, parsedOperation.layerId);
  }

  if (parsedOperation.type === 'layer.update') {
    return patchLayer(document, parsedOperation.layerId, parsedOperation.before);
  }

  if (parsedOperation.type === 'layer.delete') {
    return parsedOperation.deletedFeatures.reduce(
      (nextDocument, feature) => upsertFeature(nextDocument, feature),
      upsertLayer(document, parsedOperation.before)
    );
  }

  if (parsedOperation.type === 'feature.create') {
    return removeFeature(document, parsedOperation.featureId);
  }

  if (parsedOperation.type === 'feature.update') {
    return patchFeature(document, parsedOperation.featureId, parsedOperation.before);
  }

  if (parsedOperation.type === 'feature.delete') {
    return upsertFeature(document, parsedOperation.before);
  }

  return parsedOperation.features.reduce(
    (nextDocument, feature) => removeFeature(nextDocument, feature.id),
    document
  );
}

export function revertOperations<T extends MapDocumentLike>(document: T, operations: MapOperation[]): T {
  return operations.reduceRight((nextDocument, operation) => (
    revertOperation(nextDocument, operation)
  ), document);
}

export function applyCommit<T extends MapDocumentLike>(document: T, commit: LocalMapCommit): T {
  return applyOperations(document, validateLocalMapCommit(commit).operations);
}

export function revertCommit<T extends MapDocumentLike>(document: T, commit: LocalMapCommit): T {
  return revertOperations(document, validateLocalMapCommit(commit).operations);
}

function upsertLayer<T extends MapDocumentLike>(document: T, layer: MapLayer): T {
  const existingLayer = document.layers.find((item) => item.id === layer.id);
  const layers = existingLayer
    ? document.layers.map((item) => (item.id === layer.id ? layer : item))
    : [...document.layers, layer];

  return validateMapDocument({
    ...document,
    layers: layers
      .map((item) => ({
        ...item,
        featureIds: item.id === layer.id ? [...new Set(item.featureIds)] : item.featureIds
      }))
      .sort((first, second) => first.order - second.order)
  });
}

function patchLayer<T extends MapDocumentLike>(document: T, layerId: string, patch: Patch): T {
  if (!document.layers.some((layer) => layer.id === layerId)) {
    return document;
  }

  return validateMapDocument({
    ...document,
    layers: document.layers.map((layer) => (
      layer.id === layerId
        ? {
          ...layer,
          ...patch,
          id: layer.id
        }
        : layer
    ))
  });
}

function removeLayer<T extends MapDocumentLike>(document: T, layerId: string): T {
  const deletedFeatureIds = new Set(
    Object.values(document.features)
      .filter((feature) => feature.layerId === layerId)
      .map((feature) => feature.id)
  );
  const nextFeatures = Object.fromEntries(
    Object.entries(document.features).filter(([featureId, feature]) => (
      feature.layerId !== layerId && !deletedFeatureIds.has(featureId)
    ))
  );

  return validateMapDocument({
    ...document,
    layers: document.layers
      .filter((layer) => layer.id !== layerId)
      .map((layer) => ({
        ...layer,
        featureIds: layer.featureIds.filter((featureId) => !deletedFeatureIds.has(featureId))
      })),
    features: nextFeatures,
    selectedLayerId: document.selectedLayerId === layerId ? null : document.selectedLayerId,
    selectedFeatureId: document.selectedFeatureId && nextFeatures[document.selectedFeatureId]
      ? document.selectedFeatureId
      : null
  });
}

function upsertFeature<T extends MapDocumentLike>(document: T, feature: MapFeature): T {
  if (!document.layers.some((layer) => layer.id === feature.layerId)) {
    return document;
  }

  const previousFeature = document.features[feature.id];

  return validateMapDocument({
    ...document,
    features: {
      ...document.features,
      [feature.id]: feature
    },
    layers: document.layers.map((layer) => {
      const shouldRemoveFromPreviousLayer = previousFeature
        && previousFeature.layerId === layer.id
        && previousFeature.layerId !== feature.layerId;
      const featureIds = shouldRemoveFromPreviousLayer
        ? layer.featureIds.filter((id) => id !== feature.id)
        : layer.featureIds;

      return layer.id === feature.layerId
        ? {
          ...layer,
          featureIds: [...new Set([...featureIds, feature.id])]
        }
        : {
          ...layer,
          featureIds
        };
    })
  });
}

function patchFeature<T extends MapDocumentLike>(document: T, featureId: string, patch: Patch): T {
  const feature = document.features[featureId];
  if (!feature) {
    return document;
  }

  return upsertFeature(document, {
    ...feature,
    ...patch,
    id: feature.id
  });
}

function removeFeature<T extends MapDocumentLike>(document: T, featureId: string): T {
  if (!document.features[featureId]) {
    return document;
  }

  const nextFeatures = { ...document.features };
  delete nextFeatures[featureId];

  return validateMapDocument({
    ...document,
    features: nextFeatures,
    layers: document.layers.map((layer) => ({
      ...layer,
      featureIds: layer.featureIds.filter((id) => id !== featureId)
    })),
    selectedFeatureId: document.selectedFeatureId === featureId ? null : document.selectedFeatureId
  });
}
