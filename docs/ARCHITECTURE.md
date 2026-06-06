# Architecture Notes

## Purpose

This project is a frontend prototype for a map document editor. It is designed to test the information architecture and state model for an AgentGIS-style workspace before introducing backend services.

## Application Shape

The app is organized around a Vue Router shell:

- `src/App.vue` renders the active route.
- `src/router.ts` defines the main workspace routes and demo routes.
- `src/layouts/AppLayout.vue` mounts both desktop and mobile shells.
- `src/components/DesktopShell.vue` contains the main desktop workspace composition.
- `src/components/mobile/MobileShell.vue` contains the mobile shell.

## State

State is kept in Pinia stores:

- `src/stores/mapDocumentStore.ts`
  - active draft/saved document
  - layers and features
  - viewport
  - local operation history
  - undo/redo stacks
  - external operation records
  - GeoJSON import/export actions

- `src/stores/settingsStore.ts`
  - BYOK toggle
  - AMap base map credentials
  - AMap POI key
  - LLM endpoint/model/API key placeholders

All state is local to the browser. There is no server sync in this repository.

## Map Document Model

The core schema lives in `src/schemas/mapDocumentSchema.ts` and is validated with Zod. The model includes:

- workspaces
- draft and saved map documents
- layers
- GeoJSON-backed features
- layer image resources
- selected layer/feature state
- local operations
- local commits
- external operation review records

Mutation helpers are split into `src/shared/mapDocument/*` so the store can remain an orchestration layer rather than a pile of inline transformations.

## Map Integration

AMap/Gaode integration is isolated behind:

- `src/shared/amap/amapLoader.ts`
- `src/components/AmapBaseMap.vue`
- `src/shared/amap/amapDrawingSession.ts`
- `src/shared/amap/amapEditSession.ts`
- `src/shared/map/amapFeatureAdapter.ts`

The app only attempts to load the base map when BYOK is enabled and both the JS API Key and Security Code are present.

## External Operations

The project models external operations as structured records that can be matched against local operation history. This is useful for future AI/backend integration because an external suggestion can be represented as a typed map operation before it is applied.

This is currently a local frontend model only. It does not call an LLM or backend service.

## Boundaries

Included:

- local state model
- local map document editing
- AMap drawing/editing integration
- GeoJSON import/export
- desktop/mobile UI shells

Not included:

- backend persistence
- user authentication
- multi-user collaboration
- production secret storage
- server-side map processing
- automated test suite
- CI/CD pipeline

