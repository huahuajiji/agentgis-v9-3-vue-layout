import {
  MapDocumentStateSchema,
  MapViewportSchema,
  WorkspaceSchema,
  type MapDocumentState,
  type MapViewport,
  type Workspace
} from '../../schemas/mapDocumentSchema';
import { createDraftDocument } from './mapDocumentCollection';
import { DEFAULT_WORKSPACE_ID } from './mapDocumentConstants';
import {
  normalizeStoredState,
  type MigrationNotice
} from './mapDocumentMigration';

const STORAGE_KEY = 'agentgis:v9_3:map-document-state';
const LEGACY_STORAGE_KEY = 'agentgis:v9_3:map-document';
const MIGRATION_NOTICE_KEY = 'agentgis:v9_3:migration-notices';
const MIGRATION_BACKUP_KEY = 'agentgis:v9_3:map-document-state:pre-migration-backup';

type LngLat = [number, number];

export const DEFAULT_VIEWPORT: MapViewport = {
  center: [108.4177, 22.8416],
  zoom: 13,
  bounds: null
};

export function cloneViewport(value: unknown = DEFAULT_VIEWPORT): MapViewport {
  const viewport = isRecord(value) ? value : {};
  const bounds = isRecord(viewport.bounds) ? viewport.bounds : null;

  return MapViewportSchema.parse({
    center: cloneLngLat(viewport.center, DEFAULT_VIEWPORT.center),
    zoom: Number.isFinite(Number(viewport.zoom)) ? Number(viewport.zoom) : DEFAULT_VIEWPORT.zoom,
    bounds: bounds
      ? {
        northEast: cloneLngLat(bounds.northEast, DEFAULT_VIEWPORT.center),
        southWest: cloneLngLat(bounds.southWest, DEFAULT_VIEWPORT.center)
      }
      : null
  });
}

export function createDefaultState(viewport: MapViewport = DEFAULT_VIEWPORT): MapDocumentState {
  return MapDocumentStateSchema.parse({
    defaultWorkspace: createDefaultWorkspace(),
    draftDocument: createDraftDocument(viewport),
    documentsById: {},
    activeDocumentRef: { kind: 'draft' }
  });
}

export function loadStoredState() {
  if (!canUseLocalStorage()) {
    return createDefaultState();
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      backupRawStoredState(saved);
      return normalizeAndPersistNotices(JSON.parse(saved));
    }
  } catch {
    return createDefaultState();
  }

  try {
    const legacyDocument = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyDocument) {
      backupRawStoredState(legacyDocument);
      return normalizeAndPersistNotices({
        defaultWorkspace: createDefaultWorkspace(),
        draftDocument: JSON.parse(legacyDocument),
        documentsById: {},
        activeDocumentRef: { kind: 'draft' }
      });
    }
  } catch {
    return createDefaultState();
  }

  return createDefaultState();
}

export function persistState(state: MapDocumentState) {
  if (!canUseLocalStorage()) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function persistAndReturn<T>(state: MapDocumentState, value: T) {
  persistState(state);
  return value;
}

export function clearStoredState() {
  if (!canUseLocalStorage()) {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.localStorage.removeItem(MIGRATION_NOTICE_KEY);
  window.localStorage.removeItem(MIGRATION_BACKUP_KEY);
}

function normalizeAndPersistNotices(value: unknown) {
  const result = normalizeStoredState(value, {
    cloneViewport,
    createDefaultState,
    defaultViewport: DEFAULT_VIEWPORT
  });
  persistMigrationNotices(result.notices);
  return result.state;
}

function persistMigrationNotices(notices: MigrationNotice[]) {
  if (!notices.length || !canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(MIGRATION_NOTICE_KEY, JSON.stringify(notices));
    console.warn('[AgentGIS] MapDocument migration notices', notices);
  } catch {
    // Migration notices are best-effort; recovered map data should still load.
  }
}

function backupRawStoredState(raw: string) {
  if (!canUseLocalStorage() || window.localStorage.getItem(MIGRATION_BACKUP_KEY)) {
    return;
  }

  try {
    window.localStorage.setItem(MIGRATION_BACKUP_KEY, raw);
  } catch {
    // Local recovery backup is best-effort.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneLngLat(value: unknown, fallback: LngLat): LngLat {
  if (!Array.isArray(value) || value.length < 2) {
    return [...fallback];
  }

  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return [...fallback];
  }

  return [lng, lat];
}

function createDefaultWorkspace(mapIds: string[] = []): Workspace {
  return WorkspaceSchema.parse({
    id: DEFAULT_WORKSPACE_ID,
    name: 'Default workspace',
    mapIds
  });
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}
