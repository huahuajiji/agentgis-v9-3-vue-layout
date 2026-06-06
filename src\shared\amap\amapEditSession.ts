import type { Feature as GeoJsonFeature } from 'geojson';
import { GeoJsonFeatureSchema, type MapFeature } from '../../schemas/mapDocumentSchema';
import type {
  AMapMapInstance,
  AMapNamespace,
  AMapOverlayInstance,
  AMapPathEditorInstance
} from './amapLoader';
import { overlayToGeoJsonFeature, type AmapDrawGeometry } from './amapDraftGeometry';

export type AmapEditSessionState = {
  activeFeatureId: string | null;
  geometry: AmapDrawGeometry | null;
  ready: boolean;
};

type AmapEditSessionOptions = {
  AMap: AMapNamespace;
  map: AMapMapInstance;
  onStateChange: (state: AmapEditSessionState) => void;
};

export function createEmptyAmapEditState(): AmapEditSessionState {
  return {
    activeFeatureId: null,
    geometry: null,
    ready: false
  };
}

export class AmapEditSession {
  private AMap: AMapNamespace;
  private editor: AMapPathEditorInstance | null = null;
  private feature: MapFeature | null = null;
  private geometry: AmapDrawGeometry | null = null;
  private map: AMapMapInstance;
  private onStateChange: (state: AmapEditSessionState) => void;
  private overlay: AMapOverlayInstance | null = null;

  constructor({ AMap, map, onStateChange }: AmapEditSessionOptions) {
    this.AMap = AMap;
    this.map = map;
    this.onStateChange = onStateChange;
  }

  start(feature: MapFeature) {
    const geometry = toDrawGeometry(feature);
    if (!geometry) {
      this.stop();
      return false;
    }

    this.stop();
    const overlay = this.createOverlay(feature, geometry);
    if (!overlay) {
      return false;
    }

    this.feature = feature;
    this.geometry = geometry;
    this.overlay = overlay;
    this.map.add(overlay);
    this.editor = this.createEditor(geometry, overlay);
    this.editor?.open();
    this.emitState(true);
    return true;
  }

  submit(): GeoJsonFeature | null {
    if (!this.feature || !this.geometry || !this.overlay) {
      return null;
    }

    const draft = overlayToGeoJsonFeature(this.overlay, this.geometry);
    if (!draft) {
      return null;
    }

    return GeoJsonFeatureSchema.parse({
      ...this.feature.geojson,
      geometry: draft.geometry,
      properties: this.feature.geojson.properties ?? {}
    });
  }

  stop() {
    this.editor?.close();
    this.editor = null;
    if (this.overlay) {
      this.map.remove(this.overlay);
    }
    this.feature = null;
    this.geometry = null;
    this.overlay = null;
    this.emitState(false);
  }

  destroy() {
    this.stop();
  }

  private createOverlay(feature: MapFeature, geometry: AmapDrawGeometry) {
    const geojsonGeometry = feature.geojson.geometry;
    if (geometry === 'point' && geojsonGeometry.type === 'Point') {
      return new this.AMap.Marker({
        anchor: 'bottom-center',
        draggable: true,
        position: geojsonGeometry.coordinates,
        title: getFeatureName(feature),
        zIndex: 10000
      });
    }

    if (geometry === 'line' && geojsonGeometry.type === 'LineString') {
      return new this.AMap.Polyline({
        path: geojsonGeometry.coordinates,
        strokeColor: '#2f6f4f',
        strokeOpacity: 0.96,
        strokeWeight: 5,
        zIndex: 10000
      });
    }

    if (geometry === 'polygon' && geojsonGeometry.type === 'Polygon') {
      return new this.AMap.Polygon({
        fillColor: '#2f6f4f',
        fillOpacity: 0.18,
        path: geojsonGeometry.coordinates,
        strokeColor: '#2f6f4f',
        strokeOpacity: 0.92,
        strokeWeight: 3,
        zIndex: 10000
      });
    }

    return null;
  }

  private createEditor(geometry: AmapDrawGeometry, overlay: AMapOverlayInstance) {
    if (geometry === 'line') {
      return new this.AMap.PolylineEditor(this.map, overlay);
    }

    if (geometry === 'polygon') {
      return new this.AMap.PolygonEditor(this.map, overlay);
    }

    return null;
  }

  private emitState(ready: boolean) {
    this.onStateChange({
      activeFeatureId: this.feature?.id ?? null,
      geometry: this.geometry,
      ready
    });
  }
}

function toDrawGeometry(feature: MapFeature): AmapDrawGeometry | null {
  if (feature.geojson.geometry.type === 'Point') {
    return 'point';
  }
  if (feature.geojson.geometry.type === 'LineString') {
    return 'line';
  }
  if (feature.geojson.geometry.type === 'Polygon') {
    return 'polygon';
  }
  return null;
}

function getFeatureName(feature: MapFeature) {
  const properties = feature.geojson.properties;
  return properties && typeof properties.name === 'string' ? properties.name : feature.id;
}
