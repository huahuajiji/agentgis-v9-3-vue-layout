import type { Feature as GeoJsonFeature, Position } from 'geojson';
import { GeoJsonFeatureSchema } from '../../schemas/mapDocumentSchema';
import type {
  AMapLngLatInstance,
  AMapOverlayInstance
} from './amapLoader';

export type AmapDrawGeometry = 'point' | 'line' | 'polygon';

export function overlayToGeoJsonFeature(
  overlay: AMapOverlayInstance,
  geometry: AmapDrawGeometry
): GeoJsonFeature | null {
  const geojson = createGeoJsonFeature(overlay, geometry);
  if (!geojson) {
    return null;
  }

  return GeoJsonFeatureSchema.parse(geojson);
}

function createGeoJsonFeature(
  overlay: AMapOverlayInstance,
  geometry: AmapDrawGeometry
): GeoJsonFeature | null {
  if (geometry === 'point') {
    const position = overlay.getPosition?.();
    const coordinates = position ? toPosition(position) : null;
    return coordinates
      ? { type: 'Feature', geometry: { type: 'Point', coordinates }, properties: {} }
      : null;
  }

  if (geometry === 'line') {
    const path = removeConsecutiveDuplicatePositions(readFlatPath(overlay));
    return path.length >= 2
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: path }, properties: {} }
      : null;
  }

  const ring = closeRing(removeConsecutiveDuplicatePositions(readPolygonRing(overlay)));
  return ring.length >= 4
    ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} }
    : null;
}

function readFlatPath(overlay: AMapOverlayInstance): Position[] {
  const path = overlay.getPath?.();
  if (!Array.isArray(path)) {
    return [];
  }

  return path
    .filter(isLngLat)
    .map(toPosition);
}

function readPolygonRing(overlay: AMapOverlayInstance): Position[] {
  const path = overlay.getPath?.();
  if (!Array.isArray(path)) {
    return [];
  }

  const first = path[0];
  if (Array.isArray(first)) {
    return first
      .filter(isLngLat)
      .map(toPosition);
  }

  return path
    .filter(isLngLat)
    .map(toPosition);
}

function closeRing(ring: Position[]) {
  if (!ring.length) {
    return [];
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (samePosition(first, last)) {
    return ring;
  }

  return [...ring, first];
}

function removeConsecutiveDuplicatePositions(positions: Position[]) {
  return positions.filter((position, index) => (
    index === 0 || !samePosition(position, positions[index - 1])
  ));
}

function samePosition(a: Position, b: Position) {
  return a[0] === b[0] && a[1] === b[1];
}

function isLngLat(value: unknown): value is AMapLngLatInstance {
  return Boolean(
    value
      && typeof value === 'object'
      && 'getLng' in value
      && 'getLat' in value
  );
}

function toPosition(lngLat: AMapLngLatInstance): Position {
  return [lngLat.getLng(), lngLat.getLat()];
}
