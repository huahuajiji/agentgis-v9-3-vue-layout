import type { Feature as GeoJsonFeature } from 'geojson';
import type {
  AMapMapInstance,
  AMapMouseToolDrawEvent,
  AMapMouseToolInstance,
  AMapNamespace,
  AMapOverlayInstance
} from './amapLoader';
import {
  overlayToGeoJsonFeature,
  type AmapDrawGeometry
} from './amapDraftGeometry';

export type { AmapDrawGeometry } from './amapDraftGeometry';

export type AmapDraftFeature = {
  createdAt: number;
  geometry: AmapDrawGeometry;
  id: string;
  lastError: string | null;
  overlay: AMapOverlayInstance;
};

export type AmapDrawingState = {
  active: boolean;
  draftCount: number;
  failedDraftCount: number;
  geometry: AmapDrawGeometry | null;
};

type AmapDrawingSessionOptions = {
  AMap: AMapNamespace;
  map: AMapMapInstance;
  onStateChange?: (state: AmapDrawingState) => void;
};

type SubmitDraftsOptions = {
  addFeature: (input: { geojson: GeoJsonFeature; layerId: string }) => boolean | void;
  layerId: string;
  validate: (input: {
    draft: AmapDraftFeature;
    geojson: GeoJsonFeature | null;
  }) => string | null;
};

export type SubmitDraftsResult = {
  failed: number;
  messages: string[];
  submitted: number;
};

const EMPTY_DRAWING_STATE: AmapDrawingState = {
  active: false,
  draftCount: 0,
  failedDraftCount: 0,
  geometry: null
};

export function createEmptyAmapDrawingState(): AmapDrawingState {
  return { ...EMPTY_DRAWING_STATE };
}

export class AmapDrawingSession {
  private readonly drafts: AmapDraftFeature[] = [];
  private readonly map: AMapMapInstance;
  private readonly onStateChange?: (state: AmapDrawingState) => void;
  private readonly tool: AMapMouseToolInstance;
  private destroyed = false;
  private geometry: AmapDrawGeometry | null = null;

  constructor({ AMap, map, onStateChange }: AmapDrawingSessionOptions) {
    this.map = map;
    this.onStateChange = onStateChange;
    this.tool = new AMap.MouseTool(map);
    this.tool.on('draw', (event) => {
      this.handleDraw(event);
    });
    this.notify();
  }

  getDrafts() {
    return [...this.drafts];
  }

  getState(): AmapDrawingState {
    return {
      active: Boolean(this.geometry),
      draftCount: this.drafts.length,
      failedDraftCount: this.drafts.filter((draft) => draft.lastError).length,
      geometry: this.geometry
    };
  }

  start(geometry: AmapDrawGeometry) {
    if (this.destroyed) {
      return;
    }

    this.geometry = geometry;
    this.tool.close(true);
    this.startTool(geometry);
    this.readdDraftOverlays();
    this.notify();
  }

  stop() {
    if (this.destroyed) {
      return;
    }

    this.tool.close(true);
    this.geometry = null;
    this.readdDraftOverlays();
    this.notify();
  }

  clearDrafts() {
    if (this.destroyed) {
      return;
    }

    this.tool.close(true);
    this.removeDraftOverlays(this.drafts);
    this.drafts.splice(0);
    this.geometry = null;
    this.notify();
  }

  submitDrafts({ addFeature, layerId, validate }: SubmitDraftsOptions): SubmitDraftsResult {
    if (this.destroyed) {
      return { failed: 0, messages: [], submitted: 0 };
    }

    this.tool.close(true);

    let submitted = 0;
    const failedMessages: string[] = [];
    const submittedDrafts: AmapDraftFeature[] = [];

    this.drafts.forEach((draft, index) => {
      const geojson = overlayToGeoJsonFeature(draft.overlay, draft.geometry);
      const validationMessage = validate({ draft, geojson });

      if (validationMessage) {
        draft.lastError = validationMessage;
        failedMessages.push(`草稿 ${index + 1}: ${validationMessage}`);
        return;
      }

      try {
        const added = addFeature({ geojson: geojson as GeoJsonFeature, layerId });
        if (added === false) {
          draft.lastError = '写入 MapDocument 失败';
          failedMessages.push(`草稿 ${index + 1}: 写入 MapDocument 失败`);
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '写入 MapDocument 失败';
        draft.lastError = message;
        failedMessages.push(`草稿 ${index + 1}: ${message}`);
        return;
      }

      draft.lastError = null;
      submitted += 1;
      submittedDrafts.push(draft);
    });

    this.removeDraftOverlays(submittedDrafts);
    const submittedIds = new Set(submittedDrafts.map((draft) => draft.id));
    const remainingDrafts = this.drafts.filter((draft) => !submittedIds.has(draft.id));
    this.drafts.splice(0, this.drafts.length, ...remainingDrafts);
    this.geometry = null;
    this.readdDraftOverlays();
    this.notify();

    return {
      failed: failedMessages.length,
      messages: failedMessages,
      submitted
    };
  }

  destroy(clearOverlays = true) {
    if (this.destroyed) {
      return;
    }

    this.tool.close(clearOverlays);
    if (clearOverlays) {
      this.removeDraftOverlays(this.drafts);
    }
    this.drafts.splice(0);
    this.geometry = null;
    this.destroyed = true;
    this.notify();
  }

  private handleDraw(event?: AMapMouseToolDrawEvent) {
    if (!event?.obj || !this.geometry || this.destroyed) {
      return;
    }

    this.drafts.push({
      createdAt: Date.now(),
      geometry: this.geometry,
      id: createDraftId(),
      lastError: null,
      overlay: event.obj
    });
    this.notify();
  }

  private startTool(geometry: AmapDrawGeometry) {
    if (geometry === 'point') {
      this.tool.marker({
        anchor: 'bottom-center',
        cursor: 'crosshair',
        draggable: false,
        zIndex: 1200
      });
      return;
    }

    if (geometry === 'line') {
      this.tool.polyline({
        cursor: 'crosshair',
        lineCap: 'round',
        lineJoin: 'round',
        strokeColor: '#3f6f4a',
        strokeOpacity: 0.95,
        strokeWeight: 4,
        zIndex: 1200
      });
      return;
    }

    this.tool.polygon({
      cursor: 'crosshair',
      fillColor: '#3f6f4a',
      fillOpacity: 0.18,
      strokeColor: '#3f6f4a',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      zIndex: 1200
    });
  }

  private notify() {
    this.onStateChange?.(this.getState());
  }

  private readdDraftOverlays() {
    if (this.drafts.length) {
      this.map.add(this.drafts.map((draft) => draft.overlay));
    }
  }

  private removeDraftOverlays(drafts: AmapDraftFeature[]) {
    if (drafts.length) {
      this.map.remove(drafts.map((draft) => draft.overlay));
    }
  }
}

function createDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `draft-${crypto.randomUUID()}`;
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
