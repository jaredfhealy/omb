# Architecture

Last verified: 2026-10-14

## Runtime topology

- Frontend: Vue 3 + Pinia + Vue Router + Bootstrap + Chart.js
- Backend: Node.js + Express (`server/index.js`)
- Persistence: SQLite via `better-sqlite3` (`server/db.js`)

## Deployment model

- Local-only application (no cloud dependency for runtime persistence).
- API bind address: `0.0.0.0` for LAN/Tailscale access.
- Persistence file: `server/data/app.db` (gitignored).

## State persistence strategy

- Single JSON payload persisted in SQLite `app_state` table (`id=1`).
- Client loads and saves full payload through local API.

## API surface

- `GET /api/state` → returns `{ state, updatedAt }`
- `PUT /api/state` → saves full state payload
- `GET /api/backup/export` → returns full current payload
- `POST /api/backup/import` → imports full payload

## Cross-cutting constraints

- Preserve deterministic import behavior (see [Import Sequencing and Allocation](./import-sequencing-and-allocation.md)).
- Projection rows are computed, not source-of-truth persisted rows.
