import type { Feature as GeoJsonFeature, Position } from 'geojson';
import type { LayerGeometryType, MapLayer } from '../../schemas/mapDocumentSchema';
import type { AmapDrawGeometry } from '../amap/amapDraftGeometry';

export type DraftValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateDraftFeatureForLayer(
  layer: MapLayer | null,
  geometry: AmapDrawGeometry,
  geojson: GeoJsonFeature | null
): DraftValidationResult {
  const layerResult = validateDraftTargetLayer(layer, geometry);
  if (!layerResult.ok) {
    return layerResult;
  }

  if (!geojson) {
    return { ok: false, reason: '无法读取草稿坐标' };
  }

  if (!isLayerCompatibleWithGeometry(layer, geometry)) {
    return { ok: false, reason: `草稿类型和图层类型不匹配` };
  }

  if (geometry === 'point') {
    return validatePoint(geojson);
  }

  if (geometry === 'line') {
    return validateLineString(geojson);
  }

  return validatePolygon(geojson);
}

export function validateDraftTargetLayer(
  layer: MapLayer | null,
  geometry?: AmapDrawGeometry
): DraftValidationResult {
  if (!layer) {
    return { ok: false, reason: '先选择一个正式图层' };
  }

  if (layer.role !== 'work') {
    return { ok: false, reason: '参考图层不能写入新要素' };
  }

  if (geometry && !isLayerCompatibleWithGeometry(layer, geometry)) {
    return { ok: false, reason: `当前图层不能写入${drawGeometryLabel(geometry)}` };
  }

  return { ok: true };
}

export function isLayerCompatibleWithGeometry(layer: MapLayer | null, geometry: AmapDrawGeometry) {
  if (!layer) {
    return false;
  }

  return layer.geometryType === 'mixed' || layer.geometryType === geometryToLayerType(geometry);
}

export function geometryToLayerType(geometry: AmapDrawGeometry): LayerGeometryType {
  if (geometry === 'point') {
    return 'point';
  }
  if (geometry === 'line') {
    return 'line';
  }
  return 'polygon';
}

export function drawGeometryLabel(geometry: AmapDrawGeometry) {
  const labels: Record<AmapDrawGeometry, string> = {
    point: '点',
    line: '线',
    polygon: '面'
  };
  return labels[geometry];
}

function validatePoint(feature: GeoJsonFeature): DraftValidationResult {
  if (feature.geometry.type !== 'Point') {
    return { ok: false, reason: '草稿不是点要素' };
  }

  return isValidPosition(feature.geometry.coordinates)
    ? { ok: true }
    : { ok: false, reason: '点坐标无效' };
}

function validateLineString(feature: GeoJsonFeature): DraftValidationResult {
  if (feature.geometry.type !== 'LineString') {
    return { ok: false, reason: '草稿不是线要素' };
  }

  const positions = uniquePositions(feature.geometry.coordinates);
  if (positions.length < 2) {
    return { ok: false, reason: '线至少需要 2 个不同点' };
  }

  return { ok: true };
}

function validatePolygon(feature: GeoJsonFeature): DraftValidationResult {
  if (feature.geometry.type !== 'Polygon') {
    return { ok: false, reason: '草稿不是面要素' };
  }

  const ring = feature.geometry.coordinates[0] ?? [];
  const uniqueRing = uniquePositions(stripClosingPosition(ring));
  if (uniqueRing.length < 3) {
    return { ok: false, reason: '面至少需要 3 个不同点' };
  }

  if (Math.abs(signedRingArea(uniqueRing)) < 1e-12) {
    return { ok: false, reason: '面面积太小' };
  }

  if (hasSelfIntersection(uniqueRing)) {
    return { ok: false, reason: '面边线自相交' };
  }

  return { ok: true };
}

function isValidPosition(position: Position) {
  const lng = Number(position[0]);
  const lat = Number(position[1]);
  return Number.isFinite(lng)
    && Number.isFinite(lat)
    && lng >= -180
    && lng <= 180
    && lat >= -90
    && lat <= 90;
}

function stripClosingPosition(ring: Position[]) {
  if (ring.length > 1 && samePosition(ring[0], ring[ring.length - 1])) {
    return ring.slice(0, -1);
  }

  return ring;
}

function uniquePositions(positions: Position[]) {
  const seen = new Set<string>();
  return positions.filter((position) => {
    if (!isValidPosition(position)) {
      return false;
    }

    const key = `${position[0]},${position[1]}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function signedRingArea(ring: Position[]) {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + Number(point[0]) * Number(next[1]) - Number(next[0]) * Number(point[1]);
  }, 0) / 2;
}

function hasSelfIntersection(ring: Position[]) {
  const edges = ring.map((start, index) => ({
    start,
    end: ring[(index + 1) % ring.length]
  }));

  return edges.some((edge, index) => (
    edges.some((otherEdge, otherIndex) => {
      if (index >= otherIndex || areAdjacentEdges(index, otherIndex, edges.length)) {
        return false;
      }

      return segmentsIntersect(edge.start, edge.end, otherEdge.start, otherEdge.end);
    })
  ));
}

function areAdjacentEdges(a: number, b: number, edgeCount: number) {
  return Math.abs(a - b) === 1 || Math.abs(a - b) === edgeCount - 1;
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position) {
  const d1 = direction(c, d, a);
  const d2 = direction(c, d, b);
  const d3 = direction(a, b, c);
  const d4 = direction(a, b, d);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return d1 === 0 && onSegment(c, d, a)
    || d2 === 0 && onSegment(c, d, b)
    || d3 === 0 && onSegment(a, b, c)
    || d4 === 0 && onSegment(a, b, d);
}

function direction(a: Position, b: Position, c: Position) {
  return (Number(c[0]) - Number(a[0])) * (Number(b[1]) - Number(a[1]))
    - (Number(b[0]) - Number(a[0])) * (Number(c[1]) - Number(a[1]));
}

function onSegment(a: Position, b: Position, c: Position) {
  return Math.min(Number(a[0]), Number(b[0])) <= Number(c[0])
    && Number(c[0]) <= Math.max(Number(a[0]), Number(b[0]))
    && Math.min(Number(a[1]), Number(b[1])) <= Number(c[1])
    && Number(c[1]) <= Math.max(Number(a[1]), Number(b[1]));
}

function samePosition(a: Position, b: Position) {
  return a[0] === b[0] && a[1] === b[1];
}
