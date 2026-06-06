import { computed, ref } from 'vue';
import { acceptHMRUpdate, defineStore } from 'pinia';
import {
  ActiveDocumentRefSchema,
  DraftMapDocumentSchema,
  GeoJsonFeatureSchema,
  MapDocumentStateSchema,
  SavedMapDocumentSchema,
  type ActiveDocumentRef,
  type DraftMapDocument,
  type ExternalMapOperationRecord,
  type LocalMapCommit,
  type MapDocumentState,
  type MapFeature,
  type MapLayer,
  type MapOperation,
  type MapOperationSource,
  type MapViewport,
  type SavedMapDocument
} from '../schemas/mapDocumentSchema';
import {
  addFeature as addFeatureToDocument,
  createLayer as createLayerInDocument,
  renameFeature as renameFeatureInDocument,
  renameLayer as renameLayerInDocument,
  reorderLayers as reorderLayersInDocument,
  selectFeature as selectFeatureInDocument,
  selectLayer as selectLayerInDocument,
  setLayerVisible as setLayerVisibleInDocument,
  updateFeatureGeometry as updateFeatureGeometryInDocument,
  updateFeatureProperties as updateFeaturePropertiesInDocument
} from '../shared/mapDocument/mapDocumentMutations';
import {
  deleteFeature as deleteFeatureFromDocument,
  deleteLayer as deleteLayerFromDocument
} from '../shared/mapDocument/mapDocumentDeletion';
import {
  exportGeoJson as exportGeoJsonFromDocument,
  importGeoJson as importGeoJsonToDocument
} from '../shared/mapDocument/mapDocumentGeoJson';
import type { ImportGeoJsonResult } from '../shared/mapDocument/mapDocumentGeoJson';
import {
  createMap as createMapInCollection,
  createDraftDocument,
  deleteMap as deleteMapFromCollection,
  renameMap as renameMapInCollection,
  type CreateMapInput,
  type DeleteMapInput,
  type RenameMapInput
} from '../shared/mapDocument/mapDocumentCollection';
import { DRAFT_DOCUMENT_ID } from '../shared/mapDocument/mapDocumentConstants';
import {
  validateLocalMapCommit,
  validateExternalMapOperationRecord,
  validateMapDocumentEditState,
  validateMapOperation
} from '../shared/mapDocument/mapDocumentEditValidation';
import { compactOperations } from '../shared/mapDocument/mapDocumentEditOperations';
import {
  collectInternalOperationHistory,
  matchExternalOperationToInternalHistory
} from '../shared/mapDocument/mapDocumentExternalOperations';
import {
  redoWorkingOperation as redoWorkingOperationInDocument,
  undoWorkingOperation as undoWorkingOperationInDocument
} from '../shared/mapDocument/mapDocumentUndoRedo';
import {
  clearStoredState,
  cloneViewport,
  createDefaultState,
  DEFAULT_VIEWPORT,
  loadStoredState,
  persistAndReturn,
  persistState
} from '../shared/mapDocument/mapDocumentPersistence';
import type {
  AddFeatureInput,
  CreateLayerInput,
  DeleteFeatureInput,
  DeleteLayerInput,
  ExportGeoJsonOptions,
  ImportGeoJsonInput,
  RenameFeatureInput,
  RenameLayerInput,
  UpdateFeatureGeometryInput,
  UpdateFeaturePropertiesInput
} from '../shared/mapDocument/mapDocumentValidation';

export type {
  ActiveDocumentRef,
  DraftMapDocument,
  ExternalMapOperationRecord,
  LayerGeometryType,
  LayerImageResource,
  LayerRole,
  LngLat,
  LocalMapCommit,
  MapBounds,
  MapDocumentEditState,
  MapDocumentState,
  MapFeature,
  MapLayer,
  MapOperation,
  MapOperationSource,
  MapViewport,
  SavedMapDocument,
  Workspace
} from '../schemas/mapDocumentSchema';

export { createDraftDocument } from '../shared/mapDocument/mapDocumentCollection';

type SaveDraftInput = {
  name: string;
  workspaceId?: string;
};

type CommitWorkingOperationsInput = {
  message?: string;
};

type AddExternalOperationInput = {
  operation: OperationInput | MapOperation;
  source?: MapOperationSource;
  message?: string;
};

type InternalActionOptions = {
  source?: MapOperationSource;
};

type ActiveMapDocument = DraftMapDocument | SavedMapDocument;
type OperationInput = MapOperation extends infer Operation
  ? Operation extends MapOperation
    ? Omit<Operation, 'id' | 'createdAt' | 'source'> & Partial<Pick<Operation, 'id' | 'createdAt' | 'source'>>
    : never
  : never;

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export const useMapDocumentStore = defineStore('mapDocument', () => {
  const state = ref<MapDocumentState>(loadStoredState());

  const activeDocumentRef = computed(() => state.value.activeDocumentRef);
  const defaultWorkspace = computed(() => state.value.defaultWorkspace);
  const draftDocument = computed(() => state.value.draftDocument);
  const documentsById = computed(() => state.value.documentsById);
  const activeDocument = computed<DraftMapDocument | SavedMapDocument>(() => {
    const ref = state.value.activeDocumentRef;

    if (ref.kind === 'saved') {
      return state.value.documentsById[ref.id] ?? state.value.draftDocument;
    }

    return state.value.draftDocument;
  });
  const savedDocuments = computed(() => (
    state.value.defaultWorkspace.mapIds
      .map((id) => state.value.documentsById[id])
      .filter((document): document is SavedMapDocument => Boolean(document))
  ));
  const viewport = computed(() => activeDocument.value.viewport);

  function saveViewport(nextViewport: MapViewport) {
    const next = cloneViewport(nextViewport);
    const ref = state.value.activeDocumentRef;

    if (ref.kind === 'saved' && state.value.documentsById[ref.id]) {
      const nextDocument = SavedMapDocumentSchema.parse({
        ...state.value.documentsById[ref.id],
        viewport: next,
        updatedAt: nowIso()
      });
      state.value = {
        ...state.value,
        documentsById: {
          ...state.value.documentsById,
          [ref.id]: nextDocument
        }
      };
      persistState(state.value);
      return;
    }

    state.value = {
      ...state.value,
      draftDocument: DraftMapDocumentSchema.parse({
        ...state.value.draftDocument,
        viewport: next
      }),
      activeDocumentRef: { kind: 'draft' }
    };
    persistState(state.value);
  }

  function setActiveDocument(nextRef: ActiveDocumentRef) {
    const parsedRef = ActiveDocumentRefSchema.parse(nextRef);
    if (parsedRef.kind === 'saved' && !state.value.documentsById[parsedRef.id]) {
      return false;
    }

    state.value = {
      ...state.value,
      activeDocumentRef: parsedRef
    };
    return persistAndReturn(state.value, true);
  }

  function createOperation(input: OperationInput): MapOperation {
    return validateMapOperation({
      id: createId('op'),
      createdAt: nowIso(),
      ...input,
      source: input.source ?? 'user'
    });
  }

  function createExternalOperationRecord(input: AddExternalOperationInput): ExternalMapOperationRecord {
    const rawOperation = input.operation as Partial<MapOperation>;
    const source = input.source ?? rawOperation.source ?? 'ai';
    const operation = validateMapOperation({
      ...rawOperation,
      id: rawOperation.id ?? createId('op'),
      createdAt: rawOperation.createdAt ?? nowIso(),
      source
    });

    return validateExternalMapOperationRecord({
      id: createId('external-op'),
      source,
      operation,
      status: 'pending',
      createdAt: nowIso(),
      checkedAt: null,
      matchedOperationId: null,
      message: input.message
    });
  }

  function appendOperations<T extends ActiveMapDocument>(document: T, operations: MapOperation[]): T {
    if (!operations.length) {
      return document;
    }

    return {
      ...document,
      edit: validateMapDocumentEditState({
        ...document.edit,
        workingOperations: [...document.edit.workingOperations, ...operations],
        redoOperations: []
      })
    } as T;
  }

  function getFeatureName(feature: MapFeature) {
    const properties = feature.geojson.properties;
    return properties && typeof properties.name === 'string' ? properties.name : feature.id;
  }

  function createFeatureUpdateOperations(
    before: ActiveMapDocument,
    after: ActiveMapDocument,
    featureId: string,
    summaryPrefix: string,
    source: MapOperationSource = 'user'
  ) {
    const beforeFeature = before.features[featureId];
    const afterFeature = after.features[featureId];
    if (!beforeFeature || !afterFeature) {
      return [];
    }

    const beforePayload = {
      geojson: beforeFeature.geojson,
      imageResourceId: beforeFeature.imageResourceId
    };
    const afterPayload = {
      geojson: afterFeature.geojson,
      imageResourceId: afterFeature.imageResourceId
    };

    if (JSON.stringify(beforePayload) === JSON.stringify(afterPayload)) {
      return [];
    }

    return [
      createOperation({
        type: 'feature.update',
        source,
        featureId,
        layerId: afterFeature.layerId,
        before: beforePayload,
        after: afterPayload,
        summary: `${summaryPrefix}「${getFeatureName(beforeFeature)}」`,
        detail: afterFeature.geojson.geometry.type
      })
    ];
  }

  function updateActiveDocumentWithOperations(
    updater: (document: ActiveMapDocument) => ActiveMapDocument,
    collectOperations: (before: ActiveMapDocument, after: ActiveMapDocument) => MapOperation[]
  ) {
    return updateActiveDocument((document) => {
      const nextDocument = updater(document);
      return appendOperations(nextDocument, collectOperations(document, nextDocument));
    });
  }

  function updateActiveDocument(
    updater: (document: ActiveMapDocument) => ActiveMapDocument
  ) {
    const ref = state.value.activeDocumentRef;

    if (ref.kind === 'saved') {
      const currentDocument = state.value.documentsById[ref.id];
      if (!currentDocument) {
        return false;
      }

      const nextDocument = SavedMapDocumentSchema.parse({
        ...updater(currentDocument),
        kind: 'saved',
        id: currentDocument.id,
        workspaceId: currentDocument.workspaceId,
        createdAt: currentDocument.createdAt,
        updatedAt: nowIso()
      });

      state.value = MapDocumentStateSchema.parse({
        ...state.value,
        documentsById: {
          ...state.value.documentsById,
          [ref.id]: nextDocument
        }
      });
      return persistAndReturn(state.value, true);
    }

    const nextDraftDocument = DraftMapDocumentSchema.parse({
      ...updater(state.value.draftDocument),
      kind: 'draft',
      id: DRAFT_DOCUMENT_ID
    });

    state.value = MapDocumentStateSchema.parse({
      ...state.value,
      draftDocument: nextDraftDocument,
      activeDocumentRef: { kind: 'draft' }
    });
    return persistAndReturn(state.value, true);
  }

  function undoWorkingOperation(): MapOperation | null {
    if (!activeDocument.value.edit.workingOperations.length) {
      return null;
    }

    let movedOperation: MapOperation | null = null;
    const updated = updateActiveDocument((document) => {
      const result = undoWorkingOperationInDocument(document);
      movedOperation = result.operation;
      return result.document;
    });

    return updated ? movedOperation : null;
  }

  function redoWorkingOperation(): MapOperation | null {
    if (!activeDocument.value.edit.redoOperations.length) {
      return null;
    }

    let movedOperation: MapOperation | null = null;
    const updated = updateActiveDocument((document) => {
      const result = redoWorkingOperationInDocument(document);
      movedOperation = result.operation;
      return result.document;
    });

    return updated ? movedOperation : null;
  }

  function createLayer(input: CreateLayerInput = {}, options: InternalActionOptions = {}) {
    return updateActiveDocumentWithOperations(
      (document) => createLayerInDocument(document, input),
      (before, after) => {
        const beforeLayerIds = new Set(before.layers.map((layer) => layer.id));
        const layer = after.layers.find((item) => !beforeLayerIds.has(item.id));
        return layer
          ? [
            createOperation({
              type: 'layer.create',
              source: options.source,
              layerId: layer.id,
              after: layer,
              summary: `新建图层「${layer.name}」`,
              detail: `${layer.role === 'reference' ? '参考图层' : '正式图层'} · ${layer.geometryType}`
            })
          ]
          : [];
      }
    );
  }

  function renameLayer(input: RenameLayerInput, options: InternalActionOptions = {}) {
    return updateActiveDocumentWithOperations(
      (document) => renameLayerInDocument(document, input),
      (before, after) => {
        const beforeLayer = before.layers.find((layer) => layer.id === input.layerId);
        const afterLayer = after.layers.find((layer) => layer.id === input.layerId);
        if (!beforeLayer || !afterLayer || beforeLayer.name === afterLayer.name) {
          return [];
        }

        return [
          createOperation({
            type: 'layer.update',
            source: options.source,
            layerId: afterLayer.id,
            before: { name: beforeLayer.name },
            after: { name: afterLayer.name },
            summary: `重命名图层「${beforeLayer.name}」`,
            detail: `改为「${afterLayer.name}」`
          })
        ];
      }
    );
  }

  function deleteLayer(input: DeleteLayerInput, options: InternalActionOptions = {}) {
    const layerId = typeof input === 'string' ? input : input.layerId;
    return updateActiveDocumentWithOperations(
      (document) => deleteLayerFromDocument(document, input),
      (before, after) => {
        const layer = before.layers.find((item) => item.id === layerId);
        if (!layer || after.layers.some((item) => item.id === layer.id)) {
          return [];
        }

        const deletedFeatures = layer.featureIds
          .map((featureId) => before.features[featureId])
          .filter((feature): feature is MapFeature => Boolean(feature));

        return [
          createOperation({
            type: 'layer.delete',
            source: options.source,
            layerId: layer.id,
            before: layer,
            deletedFeatures,
            summary: `删除图层「${layer.name}」`,
            detail: `${deletedFeatures.length} 个要素随图层删除`
          })
        ];
      }
    );
  }

  function addFeature(input: AddFeatureInput, options: InternalActionOptions = {}) {
    return updateActiveDocumentWithOperations(
      (document) => addFeatureToDocument(document, input),
      (before, after) => {
        const beforeFeatureIds = new Set(Object.keys(before.features));
        const feature = Object.values(after.features).find((item) => !beforeFeatureIds.has(item.id));
        return feature
          ? [
            createOperation({
              type: 'feature.create',
              source: options.source,
              featureId: feature.id,
              layerId: feature.layerId,
              after: feature,
              summary: `新增要素「${getFeatureName(feature)}」`,
              detail: feature.geojson.geometry.type
            })
          ]
          : [];
      }
    );
  }

  function updateFeatureProperties(input: UpdateFeaturePropertiesInput, options: InternalActionOptions = {}) {
    return updateActiveDocumentWithOperations(
      (document) => updateFeaturePropertiesInDocument(document, input),
      (before, after) => createFeatureUpdateOperations(before, after, input.featureId, '更新要素属性', options.source)
    );
  }

  function updateFeatureGeometry(input: UpdateFeatureGeometryInput, options: InternalActionOptions = {}) {
    return updateActiveDocumentWithOperations(
      (document) => updateFeatureGeometryInDocument(document, input),
      (before, after) => createFeatureUpdateOperations(before, after, input.featureId, '更新要素几何', options.source)
    );
  }

  function renameFeature(input: RenameFeatureInput, options: InternalActionOptions = {}) {
    return updateActiveDocumentWithOperations(
      (document) => renameFeatureInDocument(document, input),
      (before, after) => createFeatureUpdateOperations(before, after, input.featureId, '重命名要素', options.source)
    );
  }

  function deleteFeature(input: DeleteFeatureInput, options: InternalActionOptions = {}) {
    const featureId = typeof input === 'string' ? input : input.featureId;
    return updateActiveDocumentWithOperations(
      (document) => deleteFeatureFromDocument(document, input),
      (before, after) => {
        const feature = before.features[featureId];
        if (!feature || after.features[feature.id]) {
          return [];
        }

        return [
          createOperation({
            type: 'feature.delete',
            source: options.source,
            featureId: feature.id,
            layerId: feature.layerId,
            before: feature,
            summary: `删除要素「${getFeatureName(feature)}」`,
            detail: feature.geojson.geometry.type
          })
        ];
      }
    );
  }

  function selectLayer(layerId: string | null) {
    return updateActiveDocument((document) => selectLayerInDocument(document, layerId));
  }

  function selectFeature(featureId: string | null) {
    return updateActiveDocument((document) => selectFeatureInDocument(document, featureId));
  }

  function reorderLayers(layerIds: string[], options: InternalActionOptions = {}) {
    return updateActiveDocumentWithOperations(
      (document) => reorderLayersInDocument(document, layerIds),
      (before, after) => {
        const beforeLayersById = new Map(before.layers.map((layer) => [layer.id, layer]));
        return after.layers.flatMap((layer) => {
          const previousLayer = beforeLayersById.get(layer.id);
          if (!previousLayer || previousLayer.order === layer.order) {
            return [];
          }

          return createOperation({
            type: 'layer.update',
            source: options.source,
            layerId: layer.id,
            before: { order: previousLayer.order },
            after: { order: layer.order },
            summary: `调整图层顺序「${layer.name}」`,
            detail: `${previousLayer.order} -> ${layer.order}`
          });
        });
      }
    );
  }

  function setLayerVisible(layerId: string, visible: boolean, options: InternalActionOptions = {}) {
    return updateActiveDocumentWithOperations(
      (document) => setLayerVisibleInDocument(document, { layerId, visible }),
      (before, after) => {
        const beforeLayer = before.layers.find((layer) => layer.id === layerId);
        const afterLayer = after.layers.find((layer) => layer.id === layerId);
        if (!beforeLayer || !afterLayer || beforeLayer.visible === afterLayer.visible) {
          return [];
        }

        return [
          createOperation({
            type: 'layer.update',
            source: options.source,
            layerId,
            before: { visible: beforeLayer.visible },
            after: { visible: afterLayer.visible },
            summary: `${afterLayer.visible ? '显示' : '隐藏'}图层「${afterLayer.name}」`,
            detail: '图层可见性'
          })
        ];
      }
    );
  }

  function importGeoJson(input: ImportGeoJsonInput): ImportGeoJsonResult<DraftMapDocument | SavedMapDocument> | null {
    let importResult: ImportGeoJsonResult<DraftMapDocument | SavedMapDocument> | null = null;
    const updated = updateActiveDocumentWithOperations((document) => {
      importResult = importGeoJsonToDocument(document, input);
      return importResult.document;
    }, (before) => {
      if (!importResult) {
        return [];
      }

      const createdLayerIds = importResult.touchedLayerIds.filter((layerId) => (
        !before.layers.some((layer) => layer.id === layerId)
      ));
      const touchedLayers = importResult.touchedLayerIds
        .map((layerId) => importResult?.document.layers.find((layer) => layer.id === layerId))
        .filter((layer): layer is MapLayer => Boolean(layer));
      const importedFeatures = importResult.importedFeatureIds
        .map((featureId) => importResult?.document.features[featureId])
        .filter((feature): feature is MapFeature => Boolean(feature));

      return [
        createOperation({
          type: 'geojson.import',
          layerIds: importResult.touchedLayerIds,
          featureIds: importResult.importedFeatureIds,
          layers: touchedLayers,
          features: importedFeatures,
          summary: '导入 GeoJSON',
          detail: `${createdLayerIds.length} 个新图层 · ${importedFeatures.length} 个要素`
        })
      ];
    });

    return updated ? importResult : null;
  }

  function exportGeoJson(options?: ExportGeoJsonOptions) {
    return exportGeoJsonFromDocument(activeDocument.value, options);
  }

  function commitWorkingOperations(input: CommitWorkingOperationsInput = {}): LocalMapCommit | null {
    let createdCommit: LocalMapCommit | null = null;
    updateActiveDocument((document) => {
      const operations = document.edit.workingOperations;
      if (!operations.length) {
        return document;
      }
      const compactedOperations = compactOperations(operations);
      if (!compactedOperations.length) {
        return {
          ...document,
          edit: validateMapDocumentEditState({
            ...document.edit,
            workingOperations: [],
            redoOperations: []
          })
        };
      }

      const commit = validateLocalMapCommit({
        id: createId('commit'),
        baseRevisionId: document.edit.baseRevisionId,
        parentCommitId: document.edit.headCommitId,
        operations: compactedOperations,
        createdAt: nowIso(),
        message: input.message?.trim() || `本地提交 · ${compactedOperations.length} 个操作`,
        syncStatus: 'local'
      });
      createdCommit = commit;

      return {
        ...document,
        edit: validateMapDocumentEditState({
          ...document.edit,
          workingOperations: [],
          redoOperations: [],
          commitsById: {
            ...document.edit.commitsById,
            [commit.id]: commit
          },
          headCommitId: commit.id
        })
      };
    });

    return createdCommit;
  }

  function addExternalOperation(input: AddExternalOperationInput): ExternalMapOperationRecord | null {
    const record = createExternalOperationRecord(input);
    const updated = updateActiveDocument((document) => ({
      ...document,
      edit: validateMapDocumentEditState({
        ...document.edit,
        externalOperations: [record, ...document.edit.externalOperations]
      })
    }));

    return updated ? record : null;
  }

  function matchExternalOperation(recordId: string): ExternalMapOperationRecord | null {
    let nextRecord: ExternalMapOperationRecord | null = null;
    updateActiveDocument((document) => {
      const record = document.edit.externalOperations.find((item) => item.id === recordId);
      if (!record) {
        return document;
      }

      const result = matchExternalOperationToInternalHistory(
        record,
        collectInternalOperationHistory(document.edit)
      );
      nextRecord = validateExternalMapOperationRecord({
        ...record,
        status: result.status,
        checkedAt: nowIso(),
        matchedOperationId: result.matchedOperationId,
        message: result.message
      });

      return {
        ...document,
        edit: validateMapDocumentEditState({
          ...document.edit,
          externalOperations: document.edit.externalOperations.map((item) => (
            item.id === record.id ? nextRecord : item
          ))
        })
      };
    });

    return nextRecord;
  }

  function applyExternalOperation(recordId: string): ExternalMapOperationRecord | null {
    const record = activeDocument.value.edit.externalOperations.find((item) => item.id === recordId);
    if (!record) {
      return null;
    }

    try {
      applyOperationThroughInternalAction(record.operation);
    } catch (error) {
      return updateExternalOperationRecord(record.id, {
        status: 'failed',
        checkedAt: nowIso(),
        matchedOperationId: null,
        message: error instanceof Error ? error.message : String(error)
      });
    }

    return matchExternalOperation(record.id);
  }

  function updateExternalOperationRecord(
    recordId: string,
    patch: Partial<ExternalMapOperationRecord>
  ): ExternalMapOperationRecord | null {
    let nextRecord: ExternalMapOperationRecord | null = null;
    updateActiveDocument((document) => {
      const record = document.edit.externalOperations.find((item) => item.id === recordId);
      if (!record) {
        return document;
      }

      nextRecord = validateExternalMapOperationRecord({
        ...record,
        ...patch,
        operation: patch.operation ?? record.operation,
        source: patch.source ?? record.source
      });

      return {
        ...document,
        edit: validateMapDocumentEditState({
          ...document.edit,
          externalOperations: document.edit.externalOperations.map((item) => (
            item.id === record.id ? nextRecord : item
          ))
        })
      };
    });

    return nextRecord;
  }

  function applyOperationThroughInternalAction(operation: MapOperation) {
    const source: MapOperationSource = 'system';

    if (operation.type === 'layer.create') {
      createLayer({
        id: operation.layerId,
        name: operation.after.name,
        role: operation.after.role,
        geometryType: operation.after.geometryType,
        visible: operation.after.visible,
        locked: operation.after.locked,
        order: operation.after.order,
        style: operation.after.style
      }, { source });
      return;
    }

    if (operation.type === 'layer.update') {
      applyLayerUpdateOperation(operation, source);
      return;
    }

    if (operation.type === 'layer.delete') {
      deleteLayer(operation.layerId, { source });
      return;
    }

    if (operation.type === 'feature.create') {
      addFeature({
        id: operation.featureId,
        layerId: operation.layerId,
        geojson: operation.after.geojson,
        imageResourceId: operation.after.imageResourceId
      }, { source });
      return;
    }

    if (operation.type === 'feature.update') {
      applyFeatureUpdateOperation(operation, source);
      return;
    }

    if (operation.type === 'feature.delete') {
      deleteFeature(operation.featureId, { source });
      return;
    }

    throw new Error('geojson.import 外部操作暂不支持直接应用，请先走 GeoJSON 导入入口。');
  }

  function applyLayerUpdateOperation(
    operation: Extract<MapOperation, { type: 'layer.update' }>,
    source: MapOperationSource
  ) {
    const layer = activeDocument.value.layers.find((item) => item.id === operation.layerId);
    if (!layer) {
      throw new Error(`图层不存在：${operation.layerId}`);
    }

    let applied = false;
    if (typeof operation.after.name === 'string' && operation.after.name !== layer.name) {
      renameLayer({ layerId: operation.layerId, name: operation.after.name }, { source });
      applied = true;
    }

    if (typeof operation.after.visible === 'boolean' && operation.after.visible !== layer.visible) {
      setLayerVisible(operation.layerId, operation.after.visible, { source });
      applied = true;
    }

    if (typeof operation.after.order === 'number' && operation.after.order !== layer.order) {
      const sortedLayers = activeDocument.value.layers.slice().sort((first, second) => first.order - second.order);
      const currentIds = sortedLayers.map((item) => item.id);
      const nextIds = currentIds.filter((layerId) => layerId !== operation.layerId);
      const targetIndex = Math.max(0, Math.min(nextIds.length, operation.after.order));
      nextIds.splice(targetIndex, 0, operation.layerId);
      reorderLayers(nextIds, { source });
      applied = true;
    }

    if (!applied) {
      throw new Error('layer.update 没有可应用的字段或当前状态已相同。');
    }
  }

  function applyFeatureUpdateOperation(
    operation: Extract<MapOperation, { type: 'feature.update' }>,
    source: MapOperationSource
  ) {
    const feature = activeDocument.value.features[operation.featureId];
    if (!feature) {
      throw new Error(`要素不存在：${operation.featureId}`);
    }

    const nextGeojson = operation.after.geojson === undefined
      ? feature.geojson
      : GeoJsonFeatureSchema.parse(operation.after.geojson);
    updateFeatureGeometry({
      featureId: operation.featureId,
      geojson: nextGeojson,
      imageResourceId: typeof operation.after.imageResourceId === 'string' || operation.after.imageResourceId === null
        ? operation.after.imageResourceId
        : feature.imageResourceId
    }, { source });
  }

  function matchExternalOperations(): ExternalMapOperationRecord[] {
    const records: ExternalMapOperationRecord[] = [];
    updateActiveDocument((document) => {
      const history = collectInternalOperationHistory(document.edit);
      const nextExternalOperations = document.edit.externalOperations.map((record) => {
        const result = matchExternalOperationToInternalHistory(record, history);
        const nextRecord = validateExternalMapOperationRecord({
          ...record,
          status: result.status,
          checkedAt: nowIso(),
          matchedOperationId: result.matchedOperationId,
          message: result.message
        });
        records.push(nextRecord);
        return nextRecord;
      });

      return {
        ...document,
        edit: validateMapDocumentEditState({
          ...document.edit,
          externalOperations: nextExternalOperations
        })
      };
    });

    return records;
  }

  function removeExternalOperation(recordId: string) {
    return updateActiveDocument((document) => ({
      ...document,
      edit: validateMapDocumentEditState({
        ...document.edit,
        externalOperations: document.edit.externalOperations.filter((record) => record.id !== recordId)
      })
    }));
  }

  function clearExternalOperations() {
    return updateActiveDocument((document) => ({
      ...document,
      edit: validateMapDocumentEditState({
        ...document.edit,
        externalOperations: []
      })
    }));
  }

  function createMap(input: Omit<CreateMapInput, 'viewport'> & Partial<Pick<CreateMapInput, 'viewport'>>) {
    const result = createMapInCollection(state.value, {
      ...input,
      viewport: input.viewport ?? activeDocument.value.viewport
    }, {
      createId,
      nowIso
    });
    state.value = result.state;
    return persistAndReturn(state.value, result.value);
  }

  function renameMap(input: RenameMapInput) {
    const result = renameMapInCollection(state.value, input, nowIso);
    state.value = result.state;
    return persistAndReturn(state.value, result.value);
  }

  function deleteMap(input: DeleteMapInput | string) {
    const result = deleteMapFromCollection(state.value, input);
    state.value = result.state;
    return persistAndReturn(state.value, result.value);
  }

  function saveDraftAsMap(input: SaveDraftInput) {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Map name is required');
    }

    const workspaceId = input.workspaceId?.trim() || state.value.defaultWorkspace.id;
    const id = createId('map');
    const createdAt = nowIso();
    const savedDocument = SavedMapDocumentSchema.parse({
      ...state.value.draftDocument,
      id,
      kind: 'saved',
      name,
      workspaceId,
      createdAt,
      updatedAt: createdAt
    });

    state.value = MapDocumentStateSchema.parse({
      ...state.value,
      defaultWorkspace: {
        ...state.value.defaultWorkspace,
        mapIds: [...new Set([...state.value.defaultWorkspace.mapIds, id])]
      },
      draftDocument: createDraftDocument(DEFAULT_VIEWPORT),
      documentsById: {
        ...state.value.documentsById,
        [id]: savedDocument
      },
      activeDocumentRef: {
        kind: 'saved',
        id
      }
    });

    return persistAndReturn(state.value, savedDocument);
  }

  function resetDraftDocument() {
    state.value = {
      ...state.value,
      draftDocument: createDraftDocument(DEFAULT_VIEWPORT),
      activeDocumentRef: state.value.activeDocumentRef.kind === 'draft'
        ? { kind: 'draft' }
        : state.value.activeDocumentRef
    };
    persistState(state.value);
  }

  function resetDocument() {
    state.value = createDefaultState();
    clearStoredState();
  }

  return {
    state,
    activeDocumentRef,
    defaultWorkspace,
    draftDocument,
    documentsById,
    activeDocument,
    savedDocuments,
    viewport,
    saveViewport,
    setActiveDocument,
    createLayer,
    renameLayer,
    deleteLayer,
    addFeature,
    updateFeatureProperties,
    updateFeatureGeometry,
    renameFeature,
    deleteFeature,
    selectLayer,
    selectFeature,
    reorderLayers,
    setLayerVisible,
    importGeoJson,
    exportGeoJson,
    undoWorkingOperation,
    redoWorkingOperation,
    commitWorkingOperations,
    addExternalOperation,
    applyExternalOperation,
    matchExternalOperation,
    matchExternalOperations,
    removeExternalOperation,
    clearExternalOperations,
    createMap,
    renameMap,
    deleteMap,
    saveDraftAsMap,
    resetDraftDocument,
    resetDocument
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMapDocumentStore, import.meta.hot));
}
