# AgentGIS V9.3 Vue Layout

AgentGIS V9.3 Vue Layout is a Vue 3 prototype for a GIS-oriented map document workspace. It explores how a map canvas, layer/document management, feature inspection, operation history, and AI/external operation review can live in one focused interface.

This repository contains only the `vue-layout` project from the V9.3 exploration. It is intentionally frontend-only: there is no backend service, no hosted database, and no bundled map API credentials.

## What It Includes

- Vue 3 + TypeScript + Vite application shell.
- Desktop command-center layout with map workspace, left document/layer pane, right inspector, and account/settings modal.
- Mobile shell for smaller viewports.
- Pinia stores for local map document state and account/BYOK settings.
- Map document model with layers, features, saved documents, draft document state, local commits, undo/redo, and external operation records.
- GeoJSON import/export helpers.
- Optional AMap/Gaode base map integration through user-provided JS API credentials.
- MouseTool drawing/editing demos for validating AMap drawing flows.

## Quick Start

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. By default the app starts at `/map`.

Build check:

```powershell
npm run build
```

The project was verified from a fresh clone with `npm install` and `npm run build`.

## Map Credentials

The app does not ship with map API keys. To load the AMap/Gaode base map:

1. Open the account/settings modal in the app.
2. Enable BYOK.
3. Enter your AMap JS API Key and Security Code.
4. Save settings.

Credentials are stored only in browser `localStorage` for this prototype. Do not treat this as a production credential-management pattern.

## Routes

- `/map` - main map workspace.
- `/project` - project section shell.
- `/data` - data section shell.
- `/ai` - AI section shell.
- `/history` - history section shell.
- `/settings` - settings section shell.
- `/mousetool-vue-demo` - isolated MouseTool drawing demo.
- `/mousetool-transition-demo` - MouseTool transition/operation demo.

## Documentation

- [Usage Guide](docs/USAGE.md)
- [Architecture Notes](docs/ARCHITECTURE.md)
- [Project Review](docs/PROJECT_REVIEW.md)

## Current Status

This is a prototype, not a production GIS platform. The strongest parts are the interaction model, document state shape, and local editing workflow. The main gaps are backend persistence, authentication, tests, deployment configuration, and production-grade credential handling.

## Tech Stack

- Vue 3.5
- TypeScript 5.7
- Vite 6
- Pinia 3
- Vue Router 4
- Zod 4
- `@amap/amap-jsapi-loader`

