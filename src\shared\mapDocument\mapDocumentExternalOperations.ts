import type {
  ExternalMapOperationRecord,
  ExternalOperationStatus,
  MapOperation
} from '../../schemas/mapDocumentSchema';

export type ExternalOperationMatchResult = {
  status: Extract<ExternalOperationStatus, 'applied' | 'mismatch' | 'failed'>;
  matchedOperationId: string | null;
  message: string;
};

export function matchExternalOperationToInternalHistory(
  record: ExternalMapOperationRecord,
  internalOperations: MapOperation[]
): ExternalOperationMatchResult {
  const targetMatches = internalOperations.filter((operation) => hasSameTarget(record.operation, operation));
  const exactMatches = targetMatches.filter((operation) => hasSameEffect(record.operation, operation));

  if (exactMatches.length === 1) {
    return {
      status: 'applied',
      matchedOperationId: exactMatches[0].id,
      message: '已匹配到地图实际生成的内部操作'
    };
  }

  if (exactMatches.length > 1) {
    return {
      status: 'failed',
      matchedOperationId: null,
      message: `匹配到 ${exactMatches.length} 条相同内部操作，需要人工确认`
    };
  }

  if (targetMatches.length > 0) {
    return {
      status: 'mismatch',
      matchedOperationId: null,
      message: '找到相同目标，但 before/after 或载荷没有对上'
    };
  }

  return {
    status: 'mismatch',
    matchedOperationId: null,
    message: '没有找到对应的内部操作'
  };
}

export function collectInternalOperationHistory(edit: {
  workingOperations: MapOperation[];
  redoOperations: MapOperation[];
  commitsById: Record<string, { operations: MapOperation[] }>;
}) {
  return [
    ...edit.workingOperations,
    ...edit.redoOperations,
    ...Object.values(edit.commitsById).flatMap((commit) => commit.operations)
  ];
}

function hasSameTarget(first: MapOperation, second: MapOperation) {
  if (first.type !== second.type) {
    return false;
  }

  if (first.type === 'geojson.import' && second.type === 'geojson.import') {
    return isSameStringSet(first.layerIds, second.layerIds)
      && isSameStringSet(first.featureIds, second.featureIds);
  }

  if ('featureId' in first && 'featureId' in second) {
    return first.featureId === second.featureId && first.layerId === second.layerId;
  }

  if ('layerId' in first && 'layerId' in second) {
    return first.layerId === second.layerId;
  }

  return false;
}

function hasSameEffect(first: MapOperation, second: MapOperation) {
  if (!hasSameTarget(first, second)) {
    return false;
  }

  if (first.type === 'layer.create' && second.type === 'layer.create') {
    return isSameValue(first.after, second.after);
  }

  if (first.type === 'layer.update' && second.type === 'layer.update') {
    return isSameValue(first.before, second.before) && isSameValue(first.after, second.after);
  }

  if (first.type === 'layer.delete' && second.type === 'layer.delete') {
    return isSameValue(first.before, second.before)
      && isSameValue(first.deletedFeatures, second.deletedFeatures);
  }

  if (first.type === 'feature.create' && second.type === 'feature.create') {
    return isSameValue(first.after, second.after);
  }

  if (first.type === 'feature.update' && second.type === 'feature.update') {
    return isSameValue(first.before, second.before) && isSameValue(first.after, second.after);
  }

  if (first.type === 'feature.delete' && second.type === 'feature.delete') {
    return isSameValue(first.before, second.before);
  }

  if (first.type === 'geojson.import' && second.type === 'geojson.import') {
    return isSameValue(first.layers, second.layers) && isSameValue(first.features, second.features);
  }

  return false;
}

function isSameStringSet(first: string[], second: string[]) {
  if (first.length !== second.length) {
    return false;
  }
  const secondSet = new Set(second);
  return first.every((value) => secondSet.has(value));
}

function isSameValue(first: unknown, second: unknown) {
  return JSON.stringify(first) === JSON.stringify(second);
}
