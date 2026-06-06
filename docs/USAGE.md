# Usage Guide

## Install

```powershell
npm install
```

## Run Locally

```powershell
npm run dev
```

Vite serves the app on `127.0.0.1` by default. Open the printed URL in a browser.

## Build

```powershell
npm run build
```

This runs TypeScript/Vue type checking through `vue-tsc --noEmit`, then creates a production build with Vite.

## Preview A Production Build

```powershell
npm run preview
```

Run this after `npm run build`.

## Using AMap/Gaode

The base map is optional. Without credentials, the map area shows a fallback message.

To enable the base map:

1. Open the account/settings modal.
2. Enable BYOK.
3. Fill in AMap JS API Key and Security Code.
4. Save.

The prototype stores settings in browser `localStorage` under the `agentgis:v9_3:settings` key. Map document state is also local-only.

## Main Workflow

1. Open `/map`.
2. Create or select a map document from the left workspace.
3. Create a layer.
4. Import GeoJSON or draw features on the map.
5. Select a layer or feature to inspect and edit it.
6. Review local operations and commits in the history/inspector surfaces.
7. Export GeoJSON when needed.

## Demo Routes

The demo routes isolate AMap MouseTool behavior from the larger app shell:

- `/mousetool-vue-demo`
- `/mousetool-transition-demo`

Use them when validating drawing, editing, and transition behavior against the AMap JS API.

## Reset Local State

Use the in-app reset actions where available, or clear browser localStorage for this origin.

Important localStorage keys:

- `agentgis:v9_3:settings`
- map document state key defined in `src/shared/mapDocument/mapDocumentPersistence.ts`

