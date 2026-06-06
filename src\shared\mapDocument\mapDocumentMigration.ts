import {
  ActiveDocumentRefSchema,
  DraftMapDocumentSchema,
  GeoJsonFeatureSchema,
  MapDocumentStateSchema,
  MapFeatureSchema,
  MapLayerSchema,
  SavedMapDocumentSchema,
  WorkspaceSchema,
  type ActiveDocumentRef,
  type DraftMapDocument,
  type MapDocumentState,
  type MapFeature,
  type MapLayer,
  type MapViewport,
  type SavedMapDocument,
  type Workspace
} from '../../schemas/mapDocumentSchema';
import {
  createDraftDocument,
  createEmptyEditState
} from './mapDocumentCollection';
import {
  DEFAULT_WORKSPACE_ID,
  DRAFT_DOCUMENT_ID,
  TEMP_DOCUMENT_ID
} from './mapDocumentConstants';
import { validateMapDocumentEditState } from './mapDocumentEditValidation';

export type MigrationNotice = {
  id: string;
  message: string;
  scope: string;
};

export type NormalizeStoredStateResult = {
  notices: MigrationNotice[];
  state: MapDocumentState;
};

type NormalizeStoredStateOptions = {
  cloneViewport: (value?: unknown) => MapViewport;
  createDefaultState: () => MapDocumentState;
  defaultViewport: MapViewport;
};

export function normalizeStoredState(
  value: unknown,
  options: NormalizeStoredStateOptions
): NormalizeStoredStateResult {
  if (!isRecord(value)) {
    return {
      notices: [],
      state: options.createDefaultState()
    };
  }

  const notices: MigrationNotice[] = [];
  const documentsById = normalizeSavedDocuments(value.documentsById, notices, options.cloneViewport);
  const knownMapIds = Object.keys(documentsById);
  const defaultWorkspace = normalizeWorkspace(value.defaultWorkspace, knownMapIds);
  const workspaceMapIds = defaultWorkspace.mapIds.filter((id) => Boolean(documentsById[id]));
  const state = MapDocumentStateSchema.parse({
    defaultWorkspace: {
      ...defaultWorkspace,
      mapIds: workspaceMapIds.length ? workspaceMapIds : knownMapIds
    },
    draftDocument: normalizeDraftDocument(value.draftDocument, options.defaultViewport, notices, options.cloneViewport),
    documentsById,
    activeDocumentRef: normalizeActiveDocumentRef(value.activeDocumentRef, documentsById)
  });

  return {
    notices: deduplicateNotices(notices),
    state
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createDefaultWorkspace(mapIds: string[] = []): Workspace {
  return WorkspaceSchema.parse({
    id: DEFAULT_WORKSPACE_ID,
    name: 'Default workspace',
    mapIds
  });
}

function createMigrationNotice(scope: string, message: string): MigrationNotice {
  return {
    id: `${scope}:${message}`,
    scope,
    message
  };
}

function pushNotice(notices: MigrationNotice[], scope: string, message: string) {
  notices.push(createMigrationNotice(scope, message));
}

function normalizeEditState(value: unknown) {
  try {
    return validateMapDocumentEditState(value);
  } catch {
    return createEmptyEditState();
  }
}

function normalizeDraftDocument(
  value: unknown,
  fallbackViewport: MapViewport,
  notices: MigrationNotice[],
  cloneViewport: (value?: unknown) => MapViewport
): DraftMapDocument {
  const document = isRecord(value) ? value : {};
  const candidate = {
    id: DRAFT_DOCUMENT_ID,
    kind: 'draft',
    name: typeof document.name === 'string' && document.name.trim() ? document.name : 'Draft map',
    viewport: cloneViewport(document.viewport ?? fallbackViewport),
    ...normalizeLayerFeatureCollections(document, 'draftDocument', notices),
    selectedLayerId: typeof document.selectedLayerId === 'string' ? document.selectedLayerId : null,
    selectedFeatureId: typeof document.selectedFeatureId === 'string' ? document.selectedFeatureId : null,
    edit: normalizeEditState(document.edit)
  };

  const result = DraftMapDocumentSchema.safeParse(candidate);
  return result.success ? result.data : createDraftDocument(candidate.viewport);
}

function normalizeSavedDocuments(
  value: unknown,
  notices: MigrationNotice[],
  cloneViewport: (value?: unknown) => MapViewport
): Record<string, SavedMapDocument> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, SavedMapDocument>>((documents, [key, document], index) => {
    if (!isRecord(document)) {
      pushNotice(notices, `documentsById.${key}`, '旧地图不是对象，已跳过');
      return documents;
    }

    const id = typeof document.id === 'string' && document.id.trim()
      ? document.id
      : key || createRecoveredId('map', index);
    if (id === TEMP_DOCUMENT_ID) {
      return documents;
    }

    const scope = `documentsById.${id}`;
    const createdAt = normalizeDateString(document.createdAt);
    const candidate = {
      id,
      kind: 'saved',
      name: typeof document.name === 'string' && document.name.trim()
        ? document.name
        : `Recovered map ${index + 1}`,
      workspaceId: typeof document.workspaceId === 'string' && document.workspaceId.trim()
        ? document.workspaceId
        : DEFAULT_WORKSPACE_ID,
      createdAt,
      updatedAt: normalizeDateString(document.updatedAt) || createdAt,
      viewport: cloneViewport(document.viewport),
      ...normalizeLayerFeatureCollections(document, scope, notices),
      selectedLayerId: typeof document.selectedLayerId === 'string' ? document.selectedLayerId : null,
      selectedFeatureId: typeof document.selectedFeatureId === 'string' ? document.selectedFeatureId : null,
      edit: normalizeEditState(document.edit)
    };

    if (!document.workspaceId) {
      pushNotice(notices, scope, '旧地图缺少 workspaceId，已归入默认工作区');
    }
    if (!document.createdAt || !document.updatedAt) {
      pushNotice(notices, scope, '旧地图缺少创建/更新时间，已自动补齐');
    }

    const result = SavedMapDocumentSchema.safeParse(candidate);
    if (result.success) {
      documents[result.data.id] = result.data;
    } else {
      pushNotice(notices, scope, `旧地图结构仍不兼容，已跳过：${result.error.issues[0]?.message ?? 'unknown error'}`);
    }
    return documents;
  }, {});
}

function normalizeLayerFeatureCollections(
  document: Record<string, unknown>,
  scope: string,
  notices: MigrationNotice[]
): { features: Record<string, MapFeature>; layers: MapLayer[] } {
  const hintedLayerByFeatureId = createLayerHints(document.layers);
  const features = normalizeFeatures(document.features, scope, notices, hintedLayerByFeatureId);
  const layers = normalizeLayers(document.layers, features, scope, notices);
  const existingLayerIds = new Set(layers.map((layer) => layer.id));
  const orphanFeatures = Object.values(features).filter((feature) => !existingLayerIds.has(feature.layerId));

  if (!orphanFeatures.length) {
    return { features, layers };
  }

  const recoveredLayerId = createUniqueId('layer-recovered', existingLayerIds);
  const recoveredLayer = MapLayerSchema.parse({
    id: recoveredLayerId,
    name: 'Recovered features',
    role: 'work',
    geometryType: 'mixed',
    visible: true,
    locked: false,
    order: layers.length,
    featureIds: orphanFeatures.map((feature) => feature.id),
    style: {},
    imageResources: []
  });
  const nextFeatures = Object.fromEntries(
    Object.entries(features).map(([featureId, feature]) => [
      featureId,
      existingLayerIds.has(feature.layerId)
        ? feature
        : MapFeatureSchema.parse({ ...feature, layerId: recoveredLayerId })
    ])
  );

  pushNotice(notices, scope, `${orphanFeatures.length} 个旧要素缺少有效图层，已放入恢复图层`);
  return {
    features: nextFeatures,
    layers: [...layers, recoveredLayer]
  };
}

function createLayerHints(value: unknown) {
  if (!Array.isArray(value)) {
    return new Map<string, string>();
  }

  return value.reduce<Map<string, string>>((hints, layer) => {
    if (!isRecord(layer) || typeof layer.id !== 'string' || !Array.isArray(layer.featureIds)) {
      return hints;
    }

    const layerId = layer.id;
    layer.featureIds.forEach((featureId) => {
      if (typeof featureId === 'string' && featureId && !hints.has(featureId)) {
        hints.set(featureId, layerId);
      }
    });
    return hints;
  }, new Map());
}

function normalizeFeatures(
  value: unknown,
  scope: string,
  notices: MigrationNotice[],
  hintedLayerByFeatureId: Map<string, string>
): Record<string, MapFeature> {
  const entries = Array.isArray(value)
    ? value.map((feature, index) => [String(index), feature] as const)
    : isRecord(value)
      ? Object.entries(value)
      : [];

  return entries.reduce<Record<string, MapFeature>>((features, [key, value], index) => {
    if (!isRecord(value)) {
      pushNotice(notices, `${scope}.features.${key}`, '旧要素不是对象，已跳过');
      return features;
    }

    const geojsonResult = GeoJsonFeatureSchema.safeParse(value.geojson ?? value);
    if (!geojsonResult.success) {
      pushNotice(notices, `${scope}.features.${key}`, '旧要素缺少有效 GeoJSON，已跳过');
      return features;
    }

    const id = typeof value.id === 'string' && value.id.trim()
      ? value.id
      : key || createRecoveredId('feature', index);
    const layerId = typeof value.layerId === 'string' && value.layerId.trim()
      ? value.layerId
      : hintedLayerByFeatureId.get(id) ?? '';
    const candidate = {
      id,
      layerId,
      geojson: geojsonResult.data,
      imageResourceId: typeof value.imageResourceId === 'string' && value.imageResourceId.trim()
        ? value.imageResourceId
        : null
    };
    const result = MapFeatureSchema.safeParse(candidate);
    if (result.success) {
      features[result.data.id] = result.data;
      if (!value.imageResourceId) {
        pushNotice(notices, `${scope}.features.${id}`, '旧要素缺少 imageResourceId，已设为 null');
      }
      return features;
    }

    pushNotice(notices, `${scope}.features.${id}`, '旧要素结构不兼容，已跳过');
    return features;
  }, {});
}

function normalizeLayers(
  value: unknown,
  features: Record<string, MapFeature>,
  scope: string,
  notices: MigrationNotice[]
): MapLayer[] {
  const featureIdsByLayer = Object.values(features).reduce<Record<string, string[]>>((groups, feature) => {
    if (!groups[feature.layerId]) {
      groups[feature.layerId] = [];
    }
    groups[feature.layerId].push(feature.id);
    return groups;
  }, {});
  const layers = Array.isArray(value) ? value : [];

  return layers.reduce<MapLayer[]>((nextLayers, value, index) => {
    if (!isRecord(value)) {
      pushNotice(notices, `${scope}.layers.${index}`, '旧图层不是对象，已跳过');
      return nextLayers;
    }

    const id = typeof value.id === 'string' && value.id.trim()
      ? value.id
      : createRecoveredId('layer', index);
    const layerFeatureIds = Array.isArray(value.featureIds)
      ? value.featureIds.filter((featureId): featureId is string => typeof featureId === 'string' && Boolean(features[featureId]))
      : featureIdsByLayer[id] ?? [];
    const candidate = {
      id,
      name: typeof value.name === 'string' && value.name.trim() ? value.name : `Recovered layer ${index + 1}`,
      role: value.role === 'reference' ? 'reference' : 'work',
      geometryType: normalizeLayerGeometryType(value.geometryType, layerFeatureIds, features),
      visible: typeof value.visible === 'boolean' ? value.visible : true,
      locked: typeof value.locked === 'boolean' ? value.locked : false,
      order: Number.isFinite(Number(value.order)) ? Number(value.order) : index,
      featureIds: layerFeatureIds,
      style: isRecord(value.style) ? value.style : {},
      imageResources: Array.isArray(value.imageResources) ? value.imageResources : []
    };
    const result = MapLayerSchema.safeParse(candidate);
    if (result.success) {
      nextLayers.push(result.data);
      if (!Array.isArray(value.imageResources)) {
        pushNotice(notices, `${scope}.layers.${id}`, '旧图层缺少 imageResources，已补为空数组');
      }
      return nextLayers;
    }

    pushNotice(notices, `${scope}.layers.${id}`, '旧图层结构不兼容，已跳过');
    return nextLayers;
  }, []);
}

function normalizeLayerGeometryType(
  value: unknown,
  featureIds: string[],
  features: Record<string, MapFeature>
) {
  if (value === 'point' || value === 'line' || value === 'polygon' || value === 'mixed') {
    return value;
  }

  const inferredTypes = new Set(featureIds.map((featureId) => toLayerGeometryType(features[featureId]?.geojson.geometry.type)));
  return inferredTypes.size === 1 ? [...inferredTypes][0] : 'mixed';
}

function toLayerGeometryType(geometryType: string | undefined) {
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

function normalizeDateString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : new Date().toISOString();
}

function normalizeWorkspace(value: unknown, mapIds: string[]): Workspace {
  if (!isRecord(value)) {
    return createDefaultWorkspace(mapIds);
  }

  const candidate = {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : DEFAULT_WORKSPACE_ID,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : 'Default workspace',
    mapIds: Array.isArray(value.mapIds)
      ? value.mapIds.filter((id): id is string => typeof id === 'string')
      : mapIds
  };
  const result = WorkspaceSchema.safeParse(candidate);

  return result.success ? result.data : createDefaultWorkspace(mapIds);
}

function normalizeActiveDocumentRef(value: unknown, documentsById: Record<string, SavedMapDocument>): ActiveDocumentRef {
  const result = ActiveDocumentRefSchema.safeParse(value);
  if (!result.success) {
    return { kind: 'draft' };
  }

  if (result.data.kind === 'saved' && !documentsById[result.data.id]) {
    return { kind: 'draft' };
  }

  return result.data;
}

function createRecoveredId(prefix: string, index: number) {
  return `${prefix}-recovered-${index + 1}`;
}

function createUniqueId(prefix: string, existingIds: Set<string>) {
  let index = 1;
  let id = `${prefix}-${index}`;
  while (existingIds.has(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  return id;
}

function deduplicateNotices(notices: MigrationNotice[]) {
  return [...new Map(notices.map((notice) => [notice.id, notice])).values()];
}
