import {
  normalizeDeleteFeatureInput,
  normalizeDeleteLayerInput,
  validateMapDocument,
  type DeleteFeatureInput,
  type DeleteLayerInput,
  type MapDocumentLike
} from './mapDocumentValidation';

export function deleteLayer<T extends MapDocumentLike>(document: T, input: DeleteLayerInput): T {
  const { layerId } = normalizeDeleteLayerInput(input);
  const targetLayer = document.layers.find((layer) => layer.id === layerId);

  if (!targetLayer) {
    return document;
  }

  const deletedFeatureIds = new Set(targetLayer.featureIds);
  const nextFeatures = Object.fromEntries(
    Object.entries(document.features).filter(([featureId, feature]) => (
      feature.layerId !== layerId && !deletedFeatureIds.has(featureId)
    ))
  );

  const selectedFeatureDeleted = Boolean(
    document.selectedFeatureId && !nextFeatures[document.selectedFeatureId]
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
    selectedFeatureId: selectedFeatureDeleted ? null : document.selectedFeatureId
  });
}

export function deleteFeature<T extends MapDocumentLike>(document: T, input: DeleteFeatureInput): T {
  const { featureId } = normalizeDeleteFeatureInput(input);
  const targetFeature = document.features[featureId];

  if (!targetFeature) {
    return document;
  }

  const nextFeatures = { ...document.features };
  delete nextFeatures[featureId];

  return validateMapDocument({
    ...document,
    layers: document.layers.map((layer) => ({
      ...layer,
      featureIds: layer.featureIds.filter((id) => id !== featureId)
    })),
    features: nextFeatures,
    selectedLayerId: document.selectedLayerId,
    selectedFeatureId: document.selectedFeatureId === featureId ? null : document.selectedFeatureId
  });
}
