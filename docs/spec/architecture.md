# Architecture

Last verified: 2026-10-21

## Runtime topology

- Frontend: Vue 3 + Pinia + Vue Router + Bootstrap + Chart.js
- Backend: Node.js + Express (`server/index.js`)
- Primary persistence: IndexedDB (browser-local envelope store)

## Deployment model

- Local-only application (no cloud dependency for runtime persistence).
- API bind address: `0.0.0.0` for LAN/Tailscale access.

## State persistence strategy

- Primary runtime load/save uses IndexedDB envelope storage in the browser.
- Envelope stores:
  - `meta.revision`
  - `meta.updatedAt`
  - `meta.updatedByDevice`
  - `meta.lastSyncedRevision`
  - `data` (application payload shape)
- If Google Drive is connected, local saves are mirrored to Drive asynchronously with backup snapshots.

## Cross-cutting constraints

- Preserve deterministic import behavior (see [Import Sequencing and Allocation](./import-sequencing-and-allocation.md)).
- Projection rows are computed, not source-of-truth persisted rows.
