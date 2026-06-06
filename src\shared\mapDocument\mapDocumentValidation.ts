import { z } from 'zod';
import {
  DraftMapDocumentSchema,
  GeoJsonFeatureSchema,
  LayerGeometryTypeSchema,
  LayerRoleSchema,
  type DraftMapDocument,
  type LayerGeometryType,
  SavedMapDocumentSchema,
  type SavedMapDocument
} from '../../schemas/mapDocumentSchema';

const ActionIdSchema = z.string().min(1);
const ActionNameSchema = z.string().trim().min(1);
const StyleSchema = z.record(z.string(), z.unknown());
const PropertiesSchema = z.record(z.string(), z.unknown());

export const CreateLayerInputSchema = z.object({
  id: ActionIdSchema.optional(),
  name: ActionNameSchema.optional(),
  role: LayerRoleSchema.default('work'),
  geometryType: LayerGeometryTypeSchema.default('mixed'),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  style: StyleSchema.default({}),
  order: z.number().optional()
});

export const RenameLayerInputSchema = z.object({
  layerId: ActionIdSchema,
  name: ActionNameSchema
});

export const DeleteLayerInputSchema = z.object({
  layerId: ActionIdSchema
});

export const SetLayerVisibleInputSchema = z.object({
  layerId: ActionIdSchema,
  visible: z.boolean()
});

export const AddFeatureInputSchema = z.object({
  id: ActionIdSchema.optional(),
  layerId: ActionIdSchema,
  geojson: GeoJsonFeatureSchema,
  imageResourceId: ActionIdSchema.nullable().optional()
});

export const UpdateFeaturePropertiesInputSchema = z.object({
  featureId: ActionIdSchema,
  properties: PropertiesSchema
});

export const UpdateFeatureGeometryInputSchema = z.object({
  featureId: ActionIdSchema,
  geojson: GeoJsonFeatureSchema,
  imageResourceId: ActionIdSchema.nullable().optional()
});

export const RenameFeatureInputSchema = z.object({
  featureId: ActionIdSchema,
  name: ActionNameSchema
});

export const DeleteFeatureInputSchema = z.object({
  featureId: ActionIdSchema
});

const GeoJsonFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(GeoJsonFeatureSchema)
});

export const ImportGeoJsonInputSchema = z.object({
  geojson: z.union([GeoJsonFeatureSchema, GeoJsonFeatureCollectionSchema]),
  targetLayerId: ActionIdSchema.optional(),
  layerName: ActionNameSchema.optional(),
  role: LayerRoleSchema.default('work'),
  splitByGeometryType: z.boolean().default(true)
});

export const ExportGeoJsonOptionsSchema = z.object({
  layerIds: z.array(ActionIdSchema).optional(),
  featureIds: z.array(ActionIdSchema).optional(),
  role: LayerRoleSchema.optional(),
  includeInternalProperties: z.boolean().default(true)
}).optional();

export type CreateLayerInput = z.input<typeof CreateLayerInputSchema>;
export type ParsedCreateLayerInput = z.output<typeof CreateLayerInputSchema>;
export type RenameLayerInput = z.input<typeof RenameLayerInputSchema>;
export type DeleteLayerInput = z.input<typeof DeleteLayerInputSchema> | string;
export type SetLayerVisibleInput = z.input<typeof SetLayerVisibleInputSchema>;
export type AddFeatureInput = z.input<typeof AddFeatureInputSchema>;
export type ParsedAddFeatureInput = z.output<typeof AddFeatureInputSchema>;
export type UpdateFeaturePropertiesInput = z.input<typeof UpdateFeaturePropertiesInputSchema>;
export type UpdateFeatureGeometryInput = z.input<typeof UpdateFeatureGeometryInputSchema>;
export type RenameFeatureInput = z.input<typeof RenameFeatureInputSchema>;
export type DeleteFeatureInput = z.input<typeof DeleteFeatureInputSchema> | string;
export type ImportGeoJsonInput = z.input<typeof ImportGeoJsonInputSchema>;
export type ParsedImportGeoJsonInput = z.output<typeof ImportGeoJsonInputSchema>;
export type ExportGeoJsonOptions = z.input<typeof ExportGeoJsonOptionsSchema>;
export type ParsedExportGeoJsonOptions = NonNullable<z.output<typeof ExportGeoJsonOptionsSchema>>;
export type MapDocumentLike = DraftMapDocument | SavedMapDocument;

export function validateMapDocument<T extends MapDocumentLike>(document: T): T {
  return (document.kind === 'saved'
    ? SavedMapDocumentSchema.parse(document)
    : DraftMapDocumentSchema.parse(document)) as T;
}

export function normalizeDeleteLayerInput(input: DeleteLayerInput) {
  return DeleteLayerInputSchema.parse(typeof input === 'string' ? { layerId: input } : input);
}

export function normalizeDeleteFeatureInput(input: DeleteFeatureInput) {
  return DeleteFeatureInputSchema.parse(typeof input === 'string' ? { featureId: input } : input);
}

export function createDocumentEntityId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function toLayerGeometryType(geometryType: string): LayerGeometryType {
  if (geometryType === 'Point' || geometryType === 'MultiPoint') {
    return 'point';
  }
  if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
    return 'line';
  }
  if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
    return 'polygon';
  }
  return 'mixed';
}
