import {
  DraftMapDocumentSchema,
  MapDocumentStateSchema,
  MapViewportSchema,
  SavedMapDocumentSchema,
  type DraftMapDocument,
  type MapDocumentEditState,
  type MapDocumentState,
  type MapViewport,
  type SavedMapDocument
} from '../../schemas/mapDocumentSchema';
import { DRAFT_DOCUMENT_ID } from './mapDocumentConstants';
import { validateMapDocumentEditState } from './mapDocumentEditValidation';

export type CreateMapInput = {
  name: string;
  viewport: MapViewport;
  workspaceId?: string;
};

export type RenameMapInput = {
  mapId: string;
  name: string;
};

export type DeleteMapInput = {
  mapId: string;
};

type CollectionResult<T> = {
  state: MapDocumentState;
  value: T;
};

export function createDraftDocument(viewport: MapViewport): DraftMapDocument {
  return DraftMapDocumentSchema.parse({
    id: DRAFT_DOCUMENT_ID,
    kind: 'draft',
    name: 'Draft map',
    viewport: cloneViewport(viewport),
    layers: [],
    features: {},
    selectedLayerId: null,
    selectedFeatureId: null,
    edit: createEmptyEditState()
  });
}

export function createEmptyEditState(): MapDocumentEditState {
  return validateMapDocumentEditState({
    baseRevisionId: null,
    remoteRevisionId: null,
    workingOperations: [],
    redoOperations: [],
    externalOperations: [],
    commitsById: {},
    headCommitId: null
  });
}

export function createMap(
  state: MapDocumentState,
  input: CreateMapInput,
  dependencies: { createId: (prefix: string) => string; nowIso: () => string }
): CollectionResult<SavedMapDocument> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Map name is required');
  }

  const id = dependencies.createId('map');
  const createdAt = dependencies.nowIso();
  const workspaceId = input.workspaceId?.trim() || state.defaultWorkspace.id;
  const savedDocument = SavedMapDocumentSchema.parse({
    id,
    kind: 'saved',
    name,
    workspaceId,
    createdAt,
    updatedAt: createdAt,
    viewport: cloneViewport(input.viewport),
    layers: [],
    features: {},
    selectedLayerId: null,
    selectedFeatureId: null,
    edit: createEmptyEditState()
  });

  return {
    state: MapDocumentStateSchema.parse({
      ...state,
      defaultWorkspace: {
        ...state.defaultWorkspace,
        mapIds: [...new Set([...state.defaultWorkspace.mapIds, id])]
      },
      documentsById: {
        ...state.documentsById,
        [id]: savedDocument
      },
      activeDocumentRef: {
        kind: 'saved',
        id
      }
    }),
    value: savedDocument
  };
}

export function renameMap(
  state: MapDocumentState,
  input: RenameMapInput,
  nowIso: () => string
): CollectionResult<SavedMapDocument | false> {
  const mapId = input.mapId.trim();
  const name = input.name.trim();
  if (!mapId) {
    throw new Error('Map id is required');
  }
  if (!name) {
    throw new Error('Map name is required');
  }

  const currentDocument = state.documentsById[mapId];
  if (!currentDocument) {
    return {
      state,
      value: false
    };
  }

  const nextDocument = SavedMapDocumentSchema.parse({
    ...currentDocument,
    name,
    updatedAt: nowIso()
  });

  return {
    state: MapDocumentStateSchema.parse({
      ...state,
      documentsById: {
        ...state.documentsById,
        [mapId]: nextDocument
      }
    }),
    value: nextDocument
  };
}

export function deleteMap(
  state: MapDocumentState,
  input: DeleteMapInput | string
): CollectionResult<boolean> {
  const mapId = (typeof input === 'string' ? input : input.mapId).trim();
  if (!mapId) {
    throw new Error('Map id is required');
  }
  if (!state.documentsById[mapId]) {
    return {
      state,
      value: false
    };
  }

  const nextDocumentsById = { ...state.documentsById };
  delete nextDocumentsById[mapId];

  const shouldFallbackToDraft = state.activeDocumentRef.kind === 'saved'
    && state.activeDocumentRef.id === mapId;

  return {
    state: MapDocumentStateSchema.parse({
      ...state,
      defaultWorkspace: {
        ...state.defaultWorkspace,
        mapIds: state.defaultWorkspace.mapIds.filter((id) => id !== mapId)
      },
      documentsById: nextDocumentsById,
      activeDocumentRef: shouldFallbackToDraft ? { kind: 'draft' } : state.activeDocumentRef
    }),
    value: true
  };
}

function cloneViewport(viewport: MapViewport): MapViewport {
  return MapViewportSchema.parse({
    center: [...viewport.center],
    zoom: viewport.zoom,
    bounds: viewport.bounds
      ? {
        northEast: [...viewport.bounds.northEast],
        southWest: [...viewport.bounds.southWest]
      }
      : null
  });
}
