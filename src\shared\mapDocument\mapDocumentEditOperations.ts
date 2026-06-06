import {
  MapFeatureSchema,
  MapLayerSchema,
  type MapFeature,
  type MapLayer,
  type MapOperation
} from '../../schemas/mapDocumentSchema';
import { validateMapOperation } from './mapDocumentEditValidation';

type Patch = Record<string, unknown>;
type LayerUpdateOperation = Extract<MapOperation, { type: 'layer.update' }>;
type LayerDeleteOperation = Extract<MapOperation, { type: 'layer.delete' }>;
type FeatureUpdateOperation = Extract<MapOperation, { type: 'feature.update' }>;
type FeatureDeleteOperation = Extract<MapOperation, { type: 'feature.delete' }>;

export function compactOperations(operations: MapOperation[]): MapOperation[] {
  const compacted: MapOperation[] = [];

  operations.map(validateMapOperation).forEach((operation) => {
    if (operation.type === 'layer.create') {
      compacted.push(operation);
      return;
    }

    if (operation.type === 'layer.update') {
      compactLayerUpdate(compacted, operation);
      return;
    }

    if (operation.type === 'layer.delete') {
      compactLayerDelete(compacted, operation);
      return;
    }

    if (operation.type === 'feature.create') {
      compacted.push(operation);
      return;
    }

    if (operation.type === 'feature.update') {
      compactFeatureUpdate(compacted, operation);
      return;
    }

    if (operation.type === 'feature.delete') {
      compactFeatureDelete(compacted, operation);
      return;
    }

    compacted.push(operation);
  });

  return compacted.map(validateMapOperation);
}

function compactLayerUpdate(
  operations: MapOperation[],
  operation: LayerUpdateOperation
) {
  if (isSameValue(operation.before, operation.after)) {
    return;
  }

  const createIndex = findLastIndex(operations, (item) => (
    item.type === 'layer.create' && item.layerId === operation.layerId
  ));
  if (createIndex >= 0) {
    const createOperation = operations[createIndex] as Extract<MapOperation, { type: 'layer.create' }>;
    operations[createIndex] = validateMapOperation({
      ...createOperation,
      after: applyLayerPatch(createOperation.after, operation.after)
    });
    return;
  }

  const updateIndex = findLastIndex(operations, (item) => (
    item.type === 'layer.update' && item.layerId === operation.layerId
  ));
  if (updateIndex >= 0) {
    const updateOperation = operations[updateIndex] as Extract<MapOperation, { type: 'layer.update' }>;
    const nextOperation = validateMapOperation({
      ...updateOperation,
      before: mergeBeforePatch(updateOperation.before, operation.before),
      after: mergeAfterPatch(updateOperation.after, operation.after),
      detail: operation.detail ?? updateOperation.detail
    }) as LayerUpdateOperation;
    if (isSameValue(nextOperation.before, nextOperation.after)) {
      operations.splice(updateIndex, 1);
      return;
    }
    operations[updateIndex] = nextOperation;
    return;
  }

  operations.push(operation);
}

function compactLayerDelete(
  operations: MapOperation[],
  operation: LayerDeleteOperation
) {
  const createIndex = findLastIndex(operations, (item) => (
    item.type === 'layer.create' && item.layerId === operation.layerId
  ));
  if (createIndex >= 0) {
    removeLayerScopedOperations(operations, operation.layerId);
    return;
  }

  let nextOperation = operation;
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    const item = operations[index];
    if (item.type === 'layer.update' && item.layerId === operation.layerId) {
      nextOperation = validateMapOperation({
        ...nextOperation,
        before: applyLayerPatch(nextOperation.before, item.before)
      }) as LayerDeleteOperation;
      operations.splice(index, 1);
      continue;
    }

    if (
      (item.type === 'feature.create' || item.type === 'feature.update' || item.type === 'feature.delete')
        && item.layerId === operation.layerId
    ) {
      if (item.type === 'feature.create') {
        nextOperation = removeDeletedLayerFeature(nextOperation, item.featureId);
      }

      if (item.type === 'feature.update') {
        nextOperation = mergeDeletedFeatureBefore(nextOperation, item);
      }

      if (item.type === 'feature.delete') {
        nextOperation = restoreDeletedLayerFeature(nextOperation, item.before);
      }
      operations.splice(index, 1);
    }
  }

  operations.push(nextOperation);
}

function compactFeatureUpdate(
  operations: MapOperation[],
  operation: FeatureUpdateOperation
) {
  if (isSameValue(operation.before, operation.after)) {
    return;
  }

  const createIndex = findLastIndex(operations, (item) => (
    item.type === 'feature.create' && item.featureId === operation.featureId
  ));
  if (createIndex >= 0) {
    const createOperation = operations[createIndex] as Extract<MapOperation, { type: 'feature.create' }>;
    operations[createIndex] = validateMapOperation({
      ...createOperation,
      after: applyFeaturePatch(createOperation.after, operation.after)
    });
    return;
  }

  const updateIndex = findLastIndex(operations, (item) => (
    item.type === 'feature.update' && item.featureId === operation.featureId
  ));
  if (updateIndex >= 0) {
    const updateOperation = operations[updateIndex] as Extract<MapOperation, { type: 'feature.update' }>;
    const nextOperation = validateMapOperation({
      ...updateOperation,
      before: mergeBeforePatch(updateOperation.before, operation.before),
      after: mergeAfterPatch(updateOperation.after, operation.after),
      detail: operation.detail ?? updateOperation.detail
    }) as FeatureUpdateOperation;
    if (isSameValue(nextOperation.before, nextOperation.after)) {
      operations.splice(updateIndex, 1);
      return;
    }
    operations[updateIndex] = nextOperation;
    return;
  }

  operations.push(operation);
}

function compactFeatureDelete(
  operations: MapOperation[],
  operation: FeatureDeleteOperation
) {
  const createIndex = findLastIndex(operations, (item) => (
    item.type === 'feature.create' && item.featureId === operation.featureId
  ));
  if (createIndex >= 0) {
    operations.splice(createIndex, 1);
    return;
  }

  const updateIndex = findLastIndex(operations, (item) => (
    item.type === 'feature.update' && item.featureId === operation.featureId
  ));
  if (updateIndex >= 0) {
    const updateOperation = operations[updateIndex] as Extract<MapOperation, { type: 'feature.update' }>;
    operations.splice(updateIndex, 1);
    operations.push(validateMapOperation({
      ...operation,
      before: applyFeaturePatch(operation.before, updateOperation.before)
    }) as FeatureDeleteOperation);
    return;
  }

  operations.push(operation);
}

function mergeDeletedFeatureBefore(
  operation: LayerDeleteOperation,
  updateOperation: FeatureUpdateOperation
) {
  return validateMapOperation({
    ...operation,
    deletedFeatures: operation.deletedFeatures.map((feature) => (
      feature.id === updateOperation.featureId
        ? applyFeaturePatch(feature, updateOperation.before)
        : feature
    ))
  }) as LayerDeleteOperation;
}

function removeDeletedLayerFeature(
  operation: LayerDeleteOperation,
  featureId: string
): LayerDeleteOperation {
  return validateMapOperation({
    ...operation,
    before: applyLayerPatch(operation.before, {
      featureIds: operation.before.featureIds.filter((id) => id !== featureId)
    }),
    deletedFeatures: operation.deletedFeatures.filter((feature) => feature.id !== featureId)
  }) as LayerDeleteOperation;
}

function restoreDeletedLayerFeature(
  operation: LayerDeleteOperation,
  feature: MapFeature
): LayerDeleteOperation {
  const hasFeatureId = operation.before.featureIds.includes(feature.id);
  const hasDeletedFeature = operation.deletedFeatures.some((item) => item.id === feature.id);

  return validateMapOperation({
    ...operation,
    before: applyLayerPatch(operation.before, {
      featureIds: hasFeatureId
        ? operation.before.featureIds
        : [...operation.before.featureIds, feature.id]
    }),
    deletedFeatures: hasDeletedFeature
      ? operation.deletedFeatures.map((item) => (item.id === feature.id ? feature : item))
      : [...operation.deletedFeatures, feature]
  }) as LayerDeleteOperation;
}

function removeLayerScopedOperations(operations: MapOperation[], layerId: string) {
  const filtered = operations.filter((operation) => {
    if (operation.type === 'geojson.import') {
      return true;
    }
    if ('layerId' in operation) {
      return operation.layerId !== layerId;
    }
    return true;
  });
  operations.splice(0, operations.length, ...filtered);
}

function applyLayerPatch(layer: MapLayer, patch: Patch): MapLayer {
  return MapLayerSchema.parse({
    ...layer,
    ...patch
  });
}

function applyFeaturePatch(feature: MapFeature, patch: Patch): MapFeature {
  return MapFeatureSchema.parse({
    ...feature,
    ...patch
  });
}

function mergeBeforePatch(previousBefore: Patch, nextBefore: Patch) {
  return {
    ...nextBefore,
    ...previousBefore
  };
}

function mergeAfterPatch(previousAfter: Patch, nextAfter: Patch) {
  return {
    ...previousAfter,
    ...nextAfter
  };
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }
  return -1;
}

function isSameValue(first: unknown, second: unknown) {
  return JSON.stringify(first) === JSON.stringify(second);
}
