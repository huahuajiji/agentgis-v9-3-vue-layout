import type { Geometry, Position } from 'geojson';
import type { AMapMapInstance, AMapNamespace, AMapOverlayInstance } from '../amap/amapLoader';
import type { DraftMapDocument, MapFeature, MapLayer, SavedMapDocument } from '../../stores/mapDocumentStore';

type MapDocumentLike = DraftMapDocument | SavedMapDocument;
type LngLat = [number, number];
type OverlayRegistry = Map<string, AMapOverlayInstance[]>;

type AmapFeatureAdapterOptions = {
  AMap: AMapNamespace;
  map: AMapMapInstance;
  onSelectFeature: (featureId: string) => void;
};

type FeatureAdapterSyncOptions = {
  hiddenFeatureIds?: Set<string>;
};

export class AmapFeatureAdapter {
  private AMap: AMapNamespace;
  private map: AMapMapInstance;
  private overlayRegistry: OverlayRegistry = new Map();
  private onSelectFeature: (featureId: string) => void;

  constructor({ AMap, map, onSelectFeature }: AmapFeatureAdapterOptions) {
    this.AMap = AMap;
    this.map = map;
    this.onSelectFeature = onSelectFeature;
  }

  sync(document: MapDocumentLike, options: FeatureAdapterSyncOptions = {}) {
    this.clear();

    const overlays = document.layers
      .filter((layer) => layer.visible)
      .slice()
      .sort((a, b) => a.order - b.order)
      .flatMap((layer) => this.createLayerOverlays(layer, document.features, options.hiddenFeatureIds ?? new Set()));

    if (overlays.length) {
      this.map.add(overlays);
    }
  }

  clear() {
    const overlays = [...this.overlayRegistry.values()].flat();
    if (overlays.length) {
      this.map.remove(overlays);
    }
    this.overlayRegistry.clear();
  }

  private createLayerOverlays(
    layer: MapLayer,
    featuresById: Record<string, MapFeature>,
    hiddenFeatureIds: Set<string>
  ) {
    return layer.featureIds.flatMap((featureId) => {
      if (hiddenFeatureIds.has(featureId)) {
        return [];
      }

      const feature = featuresById[featureId];
      if (!feature || feature.layerId !== layer.id) {
        return [];
      }

      const overlays = this.createFeatureOverlays(layer, feature);
      if (overlays.length) {
        this.overlayRegistry.set(feature.id, overlays);
      }
      return overlays;
    });
  }

  private createFeatureOverlays(layer: MapLayer, feature: MapFeature) {
    const geometry = feature.geojson.geometry;
    const zIndex = 100 + layer.order * 10;
    const overlays = this.createGeometryOverlays(geometry, layer, feature, zIndex);

    overlays.forEach((overlay) => {
      overlay.on?.('click', () => {
        this.onSelectFeature(feature.id);
      });
    });

    return overlays;
  }

  private createGeometryOverlays(
    geometry: Geometry,
    layer: MapLayer,
    feature: MapFeature,
    zIndex: number
  ): AMapOverlayInstance[] {
    if (geometry.type === 'Point') {
      const position = toLngLat(geometry.coordinates);
      if (!position) {
        return [];
      }

      return [
        new this.AMap.Marker({
          position,
          title: getFeatureName(feature),
          anchor: 'bottom-center',
          zIndex
        })
      ];
    }

    if (geometry.type === 'LineString') {
      const path = toPath(geometry.coordinates);
      if (path.length < 2) {
        return [];
      }

      return [
        new this.AMap.Polyline({
          path,
          zIndex,
          strokeColor: getStyleColor(layer, '#416a48'),
          strokeOpacity: 0.9,
          strokeWeight: 4,
          lineJoin: 'round',
          lineCap: 'round'
        })
      ];
    }

    if (geometry.type === 'Polygon') {
      const path = toPolygonPath(geometry.coordinates);
      if (!path.length || path[0].length < 3) {
        return [];
      }

      return [
        new this.AMap.Polygon({
          path,
          zIndex,
          strokeColor: getStyleColor(layer, '#416a48'),
          strokeOpacity: 0.78,
          strokeWeight: 2,
          fillColor: getStyleColor(layer, '#416a48'),
          fillOpacity: 0.16
        })
      ];
    }

    return [];
  }
}

function toLngLat(position: Position): LngLat | null {
  const lng = Number(position[0]);
  const lat = Number(position[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  return [lng, lat];
}

function toPath(positions: Position[]) {
  return positions
    .map(toLngLat)
    .filter((position): position is LngLat => Boolean(position));
}

function toPolygonPath(rings: Position[][]) {
  return rings
    .map(toPath)
    .filter((ring) => ring.length >= 3);
}

function getFeatureName(feature: MapFeature) {
  const properties = feature.geojson.properties;
  return properties && typeof properties.name === 'string' ? properties.name : feature.id;
}

function getStyleColor(layer: MapLayer, fallback: string) {
  const color = layer.style.color ?? layer.style.strokeColor ?? layer.style.fillColor;
  return typeof color === 'string' && color ? color : fallback;
}
