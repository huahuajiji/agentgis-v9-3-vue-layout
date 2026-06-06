import type { Feature as GeoJsonFeature, FeatureCollection } from 'geojson';
import {
  createDocumentEntityId,
  ExportGeoJsonOptionsSchema,
  ImportGeoJsonInputSchema,
  toLayerGeometryType,
  validateMapDocument,
  type ExportGeoJsonOptions,
  type ImportGeoJsonInput,
  type MapDocumentLike
} from './mapDocumentValidation';
import { addFeature, createLayer } from './mapDocumentMutations';

export type ImportGeoJsonResult<T extends MapDocumentLike> = {
  document: T;
  importedFeatureIds: string[];
  touchedLayerIds: string[];
};

const DEFAULT_LAYER_NAMES = {
  point: '导入图层 · 点',
  line: '导入图层 · 线',
  polygon: '导入图层 · 面',
  mixed: '导入图层 · 混合'
} as const;

export function importGeoJson<T extends MapDocumentLike>(
  document: T,
  input: ImportGeoJsonInput
): ImportGeoJsonResult<T> {
  const parsed = ImportGeoJsonInputSchema.parse(input);
  const features = parsed.geojson.type === 'FeatureCollection'
    ? parsed.geojson.features
    : [parsed.geojson];

  let nextDocument = document;
  const importedFeatureIds: string[] = [];
  const touchedLayerIds = new Set<string>();
  const layerIdByGeometryType = new Map<string, string>();

  for (const feature of features) {
    const geometryType = toLayerGeometryType(feature.geometry.type);
    const layerResult = parsed.targetLayerId
      ? { document: nextDocument, layerId: parsed.targetLayerId }
      : findOrCreateImportLayer({
        document: nextDocument,
        layerIdByGeometryType,
        geometryType,
        layerName: parsed.layerName,
        splitByGeometryType: parsed.splitByGeometryType,
        role: parsed.role
      });
    nextDocument = layerResult.document;
    const layerId = layerResult.layerId;

    const featureId = createDocumentEntityId('feature');
    nextDocument = addFeature(nextDocument, {
      id: featureId,
      layerId,
      geojson: normalizeImportedFeature(feature, {
        importedFeatureId: featureId,
        layerId
      }),
      imageResourceId: getImportedImageResourceId(feature)
    });
    importedFeatureIds.push(featureId);
    touchedLayerIds.add(layerId);
  }

  return {
    document: validateMapDocument({
      ...nextDocument,
      selectedLayerId: [...touchedLayerIds].at(-1) ?? nextDocument.selectedLayerId,
      selectedFeatureId: importedFeatureIds.at(-1) ?? nextDocument.selectedFeatureId
    }),
    importedFeatureIds,
    touchedLayerIds: [...touchedLayerIds]
  };
}

export function exportGeoJson(
  document: MapDocumentLike,
  options?: ExportGeoJsonOptions
): FeatureCollection {
  const parsed = ExportGeoJsonOptionsSchema.parse(options) ?? {
    includeInternalProperties: true
  };
  const layerIdFilter = parsed.layerIds ? new Set(parsed.layerIds) : null;
  const featureIdFilter = parsed.featureIds ? new Set(parsed.featureIds) : null;
  const layerById = new Map(document.layers.map((layer) => [layer.id, layer]));

  const features = Object.values(document.features)
    .filter((feature) => {
      const layer = layerById.get(feature.layerId);
      return Boolean(layer)
        && (!parsed.role || layer?.role === parsed.role)
        && (!layerIdFilter || layerIdFilter.has(feature.layerId))
        && (!featureIdFilter || featureIdFilter.has(feature.id));
    })
    .map((feature): GeoJsonFeature => {
      const layer = layerById.get(feature.layerId);
      const properties = {
        ...(feature.geojson.properties ?? {})
      };

      if (parsed.includeInternalProperties) {
        Object.assign(properties, {
          agentgis_feature_id: feature.id,
          agentgis_layer_id: feature.layerId,
          agentgis_layer_name: layer?.name,
          agentgis_image_resource_id: feature.imageResourceId
        });
      }

      return {
        ...feature.geojson,
        properties
      };
    });

  return {
    type: 'FeatureCollection',
    features
  };
}

function findOrCreateImportLayer<T extends MapDocumentLike>(input: {
  document: T;
  layerIdByGeometryType: Map<string, string>;
  geometryType: ReturnType<typeof toLayerGeometryType>;
  layerName?: string;
  splitByGeometryType: boolean;
  role: 'work' | 'reference';
}) {
  const key = input.splitByGeometryType ? input.geometryType : 'mixed';
  const cachedLayerId = input.layerIdByGeometryType.get(key);
  if (cachedLayerId) {
    return {
      document: input.document,
      layerId: cachedLayerId
    };
  }

  const matchingLayer = input.document.layers.find((layer) => (
    layer.role === input.role
      && layer.geometryType === key
      && layer.name.startsWith('导入图层')
  ));
  if (matchingLayer) {
    input.layerIdByGeometryType.set(key, matchingLayer.id);
    return {
      document: input.document,
      layerId: matchingLayer.id
    };
  }

  const layerId = createDocumentEntityId('layer');
  const nextDocument = createLayer(input.document, {
    id: layerId,
    name: input.layerName ?? DEFAULT_LAYER_NAMES[key],
    role: input.role,
    geometryType: key
  });
  input.layerIdByGeometryType.set(key, layerId);
  return {
    document: nextDocument,
    layerId
  };
}

function normalizeImportedFeature(
  feature: GeoJsonFeature,
  metadata: { importedFeatureId: string; layerId: string }
): GeoJsonFeature {
  return {
    ...feature,
    properties: {
      ...(feature.properties ?? {}),
      agentgis_imported_feature_id: metadata.importedFeatureId,
      agentgis_layer_id: metadata.layerId
    }
  };
}

function getImportedImageResourceId(feature: GeoJsonFeature) {
  const value = feature.properties?.agentgis_image_resource_id;
  return typeof value === 'string' && value ? value : null;
}
