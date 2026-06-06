import { z } from 'zod';
import type { Feature as GeoJsonFeature, Geometry } from 'geojson';

export const LngLatSchema = z.tuple([z.number(), z.number()]);

export const MapBoundsSchema = z.object({
  northEast: LngLatSchema,
  southWest: LngLatSchema
});

export const MapViewportSchema = z.object({
  center: LngLatSchema,
  zoom: z.number(),
  bounds: MapBoundsSchema.nullable()
});

export const LayerGeometryTypeSchema = z.enum(['point', 'line', 'polygon', 'mixed']);
export const LayerRoleSchema = z.enum(['work', 'reference']);
export const MapOperationSourceSchema = z.enum(['user', 'ai', 'backend', 'file', 'system']);

export const LayerImageResourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  mimeType: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const MapLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: LayerRoleSchema,
  geometryType: LayerGeometryTypeSchema,
  visible: z.boolean(),
  locked: z.boolean(),
  order: z.number(),
  featureIds: z.array(z.string()),
  style: z.record(z.string(), z.unknown()).default({}),
  imageResources: z.array(LayerImageResourceSchema).default([])
});

const GEOJSON_GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGeoJsonGeometry(value: unknown): value is Geometry {
  if (!isRecord(value) || typeof value.type !== 'string' || !GEOJSON_GEOMETRY_TYPES.has(value.type)) {
    return false;
  }

  if (value.type === 'GeometryCollection') {
    return Array.isArray(value.geometries) && value.geometries.every(isGeoJsonGeometry);
  }

  return Array.isArray(value.coordinates);
}

function isGeoJsonFeature(value: unknown): value is GeoJsonFeature {
  return isRecord(value)
    && value.type === 'Feature'
    && isGeoJsonGeometry(value.geometry)
    && (value.properties === null || isRecord(value.properties));
}

export const GeoJsonFeatureSchema = z.custom<GeoJsonFeature>(isGeoJsonFeature, {
  message: 'Expected a GeoJSON Feature'
});

export const MapFeatureSchema = z.object({
  id: z.string().min(1),
  layerId: z.string().min(1),
  geojson: GeoJsonFeatureSchema,
  imageResourceId: z.string().min(1).nullable().default(null)
});

const OperationBaseSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  source: MapOperationSourceSchema.default('user'),
  summary: z.string().min(1),
  detail: z.string().optional()
});

export const MapOperationSchema = z.discriminatedUnion('type', [
  OperationBaseSchema.extend({
    type: z.literal('layer.create'),
    layerId: z.string().min(1),
    after: MapLayerSchema
  }),
  OperationBaseSchema.extend({
    type: z.literal('layer.update'),
    layerId: z.string().min(1),
    before: z.record(z.string(), z.unknown()),
    after: z.record(z.string(), z.unknown())
  }),
  OperationBaseSchema.extend({
    type: z.literal('layer.delete'),
    layerId: z.string().min(1),
    before: MapLayerSchema,
    deletedFeatures: z.array(MapFeatureSchema)
  }),
  OperationBaseSchema.extend({
    type: z.literal('feature.create'),
    featureId: z.string().min(1),
    layerId: z.string().min(1),
    after: MapFeatureSchema
  }),
  OperationBaseSchema.extend({
    type: z.literal('feature.update'),
    featureId: z.string().min(1),
    layerId: z.string().min(1),
    before: z.record(z.string(), z.unknown()),
    after: z.record(z.string(), z.unknown())
  }),
  OperationBaseSchema.extend({
    type: z.literal('feature.delete'),
    featureId: z.string().min(1),
    layerId: z.string().min(1),
    before: MapFeatureSchema
  }),
  OperationBaseSchema.extend({
    type: z.literal('geojson.import'),
    layerIds: z.array(z.string().min(1)),
    featureIds: z.array(z.string().min(1)),
    layers: z.array(MapLayerSchema),
    features: z.array(MapFeatureSchema)
  })
]);

export const LocalMapCommitSchema = z.object({
  id: z.string().min(1),
  baseRevisionId: z.string().min(1).nullable(),
  parentCommitId: z.string().min(1).nullable(),
  operations: z.array(MapOperationSchema),
  createdAt: z.string().min(1),
  message: z.string().optional(),
  syncStatus: z.enum(['local', 'syncing', 'synced', 'conflict']).default('local')
});

export const ExternalOperationStatusSchema = z.enum(['pending', 'applied', 'mismatch', 'failed']);

export const ExternalMapOperationRecordSchema = z.preprocess((value) => {
  if (!isRecord(value) || !isRecord(value.operation)) {
    return value;
  }

  const source = typeof value.source === 'string'
    ? value.source
    : typeof value.operation.source === 'string'
      ? value.operation.source
      : 'ai';

  return {
    ...value,
    source,
    operation: {
      ...value.operation,
      source
    }
  };
}, z.object({
  id: z.string().min(1),
  source: MapOperationSourceSchema.default('ai'),
  operation: MapOperationSchema,
  status: ExternalOperationStatusSchema.default('pending'),
  createdAt: z.string().min(1),
  checkedAt: z.string().min(1).nullable().default(null),
  matchedOperationId: z.string().min(1).nullable().default(null),
  message: z.string().optional()
})).transform((record) => ({
  ...record,
  operation: {
    ...record.operation,
    source: record.source
  }
}));

export const MapDocumentEditStateSchema = z.object({
  baseRevisionId: z.string().min(1).nullable(),
  remoteRevisionId: z.string().min(1).nullable(),
  workingOperations: z.array(MapOperationSchema),
  redoOperations: z.array(MapOperationSchema).default([]),
  externalOperations: z.array(ExternalMapOperationRecordSchema).default([]),
  commitsById: z.record(z.string(), LocalMapCommitSchema),
  headCommitId: z.string().min(1).nullable()
});

const MapDocumentBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  viewport: MapViewportSchema,
  layers: z.array(MapLayerSchema),
  features: z.record(z.string(), MapFeatureSchema),
  selectedLayerId: z.string().min(1).nullable(),
  selectedFeatureId: z.string().min(1).nullable(),
  edit: MapDocumentEditStateSchema
});

export const DraftMapDocumentSchema = MapDocumentBaseSchema.extend({
  kind: z.literal('draft')
});

export const SavedMapDocumentSchema = MapDocumentBaseSchema.extend({
  kind: z.literal('saved'),
  workspaceId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const ActiveDocumentRefSchema = z.union([
  z.object({ kind: z.literal('draft') }),
  z.object({
    kind: z.literal('saved'),
    id: z.string().min(1)
  })
]);

export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mapIds: z.array(z.string())
});

export const MapDocumentStateSchema = z.object({
  defaultWorkspace: WorkspaceSchema,
  draftDocument: DraftMapDocumentSchema,
  documentsById: z.record(z.string(), SavedMapDocumentSchema),
  activeDocumentRef: ActiveDocumentRefSchema
});

export type LngLat = z.infer<typeof LngLatSchema>;
export type MapBounds = z.infer<typeof MapBoundsSchema>;
export type MapViewport = z.infer<typeof MapViewportSchema>;
export type LayerGeometryType = z.infer<typeof LayerGeometryTypeSchema>;
export type LayerRole = z.infer<typeof LayerRoleSchema>;
export type LayerImageResource = z.infer<typeof LayerImageResourceSchema>;
export type MapLayer = z.infer<typeof MapLayerSchema>;
export type MapFeature = z.infer<typeof MapFeatureSchema>;
export type MapOperationSource = z.infer<typeof MapOperationSourceSchema>;
export type MapOperation = z.infer<typeof MapOperationSchema>;
export type LocalMapCommit = z.infer<typeof LocalMapCommitSchema>;
export type ExternalOperationStatus = z.infer<typeof ExternalOperationStatusSchema>;
export type ExternalMapOperationRecord = z.infer<typeof ExternalMapOperationRecordSchema>;
export type MapDocumentEditState = z.infer<typeof MapDocumentEditStateSchema>;
export type DraftMapDocument = z.infer<typeof DraftMapDocumentSchema>;
export type SavedMapDocument = z.infer<typeof SavedMapDocumentSchema>;
export type ActiveDocumentRef = z.infer<typeof ActiveDocumentRefSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type MapDocumentState = z.infer<typeof MapDocumentStateSchema>;
