import AMapLoader from '@amap/amap-jsapi-loader';

const DEFAULT_AMAP_PLUGINS = ['AMap.ToolBar', 'AMap.Geolocation'];

type AMapControlInstance = unknown;
type AMapControlOptions = Record<string, unknown>;
type AMapEventHandler = (event?: AMapMapEvent) => void;
type AMapOverlayEventHandler = () => void;

export type AMapLngLatInstance = {
  getLng: () => number;
  getLat: () => number;
};

type AMapBoundsInstance = {
  getNorthEast: () => AMapLngLatInstance;
  getSouthWest: () => AMapLngLatInstance;
};

export type AMapMapEvent = {
  lnglat?: AMapLngLatInstance;
};

export type AMapMouseToolDrawEvent = {
  obj?: AMapOverlayInstance;
};

export type AMapOverlayInstance = {
  getPath?: () => AMapLngLatInstance[] | AMapLngLatInstance[][];
  getPosition?: () => AMapLngLatInstance;
  hide?: () => void;
  on?: (eventName: string, handler: AMapOverlayEventHandler) => void;
  show?: () => void;
};

export type AMapPathEditorInstance = {
  close: () => void;
  open: () => void;
};

export type AMapMapInstance = {
  add: (overlays: AMapOverlayInstance | AMapOverlayInstance[]) => void;
  addControl: (control: AMapControlInstance) => void;
  destroy: () => void;
  getBounds: () => AMapBoundsInstance;
  getCenter: () => AMapLngLatInstance;
  getZoom: () => number;
  off?: (eventName: string, handler: AMapEventHandler) => void;
  on: (eventName: string, handler: AMapEventHandler) => void;
  remove: (overlays: AMapOverlayInstance | AMapOverlayInstance[]) => void;
  resize?: () => void;
  setZoomAndCenter?: (zoom: number, center: [number, number]) => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
};

export type AMapMouseToolInstance = {
  close: (clearOverlays?: boolean) => void;
  marker: (options?: Record<string, unknown>) => void;
  on: (eventName: 'draw', handler: (event?: AMapMouseToolDrawEvent) => void) => void;
  polygon: (options?: Record<string, unknown>) => void;
  polyline: (options?: Record<string, unknown>) => void;
};

export type AMapNamespace = {
  Geolocation: new (options?: AMapControlOptions) => AMapControlInstance;
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMapInstance;
  Marker: new (options: Record<string, unknown>) => AMapOverlayInstance;
  MouseTool: new (map: AMapMapInstance) => AMapMouseToolInstance;
  Polygon: new (options: Record<string, unknown>) => AMapOverlayInstance;
  PolygonEditor: new (map: AMapMapInstance, polygon: AMapOverlayInstance) => AMapPathEditorInstance;
  Polyline: new (options: Record<string, unknown>) => AMapOverlayInstance;
  PolylineEditor: new (map: AMapMapInstance, polyline: AMapOverlayInstance) => AMapPathEditorInstance;
  ToolBar: new (options?: AMapControlOptions) => AMapControlInstance;
};

type LoadAmapOptions = {
  jsKey: string;
  plugins?: string[];
  securityCode: string;
};

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode: string;
    };
  }
}

export async function loadAmap({ jsKey, plugins = [], securityCode }: LoadAmapOptions) {
  window._AMapSecurityConfig = {
    securityJsCode: securityCode
  };

  return AMapLoader.load({
    key: jsKey,
    version: '2.0',
    plugins: Array.from(new Set([...DEFAULT_AMAP_PLUGINS, ...plugins]))
  }) as Promise<AMapNamespace>;
}
