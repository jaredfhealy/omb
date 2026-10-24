# Local-First PWA + Drive Sync (Phase 1)

Last verified: 2026-10-18

> Historical note: this document captures Phase 1 planning and includes legacy migration steps that are no longer active in the current runtime.

## Objective

Define the first implementation phase for moving Operation More Bacon from API-first local persistence to a local-first browser model with optional Google Drive persistence.

Phase 1 prioritizes:
- zero-server-required runtime for end users
- fast startup from local state
- safe metadata for future sync/conflict handling
- minimal disruption to existing app workflows and data model

## Scope (Phase 1)

1. **Local-first runtime persistence**
   - App reads/writes primary working state from browser storage (IndexedDB).
   - Frontend renders from local state immediately on app load.

2. **Repository-level sync metadata**
   - Persist state envelope metadata needed for future Drive sync:
     - `revision` (integer, monotonic)
     - `updatedAt` (ISO timestamp)
     - `updatedByDevice` (stable per-device ID string)
     - `lastSyncedRevision` (integer or null)

3. **Sync adapter boundary (no hard provider lock-in)**
   - Introduce a storage/sync abstraction with two implementations:
     - `local` (active in Phase 1)
     - `drive` (stubbed interface, implemented in later phase)

4. **PWA foundation**
   - Installable web app shell support.
   - Service worker caches static app shell/assets for offline startup.
   - Runtime API calls to local server are not required for normal operation.

5. **Backward compatibility migration**
   - On first Phase 1 load, if legacy API state exists and local storage is empty:
     - import API payload once into local store
     - seed metadata (`revision = 1`, `updatedAt = now`)

## Out of scope (Phase 1)

- Full Google OAuth + Drive API implementation.
- Multi-device auto-merge conflict UX.
- Background sync scheduling/retry orchestration.
- Removal of existing local Express/SQLite code paths from repository.
- Multi-user collaboration semantics.

## Runtime model

### Startup sequence

1. Load local envelope from IndexedDB.
2. If present, hydrate Pinia store and render.
3. If absent, attempt one-time legacy import from existing `/api/state` source.
4. Persist normalized envelope locally.

### Save sequence

1. Any user-initiated data mutation updates in-memory store.
2. `revision` increments by 1.
3. `updatedAt` set to current ISO time.
4. `updatedByDevice` set from stable local device identifier.
5. Persist envelope to IndexedDB asynchronously (debounced write allowed).

## Data envelope (Phase 1)

```js
{
  meta: {
    revision: Number,            // monotonic local revision
    updatedAt: ISOString,
    updatedByDevice: String,     // generated once per browser/device
    lastSyncedRevision: Number | null
  },
  data: {
    accounts: Account[]
  }
}
```

Rules:
- `data` shape remains compatible with existing account/position structures.
- `meta.updatedAt` is sync-control metadata and source of truth for persistence ordering.

## Storage details

- **Primary store:** IndexedDB (single record, e.g. key `omb.data.envelope.v1`).
- **Fallback:** optional localStorage mirror for diagnostic recovery only (not required).
- **Device ID:** generated once and stored locally (e.g. key `omb.deviceId.v1`).

## Abstraction contract

Define a persistence interface used by store actions:

```ts
interface StateRepository {
  load(): Promise<StateEnvelope | null>
  save(envelope: StateEnvelope): Promise<void>
}
```

Phase 1 implementations:
- `IndexedDbStateRepository` (active)
- `DriveStateRepository` (not yet active; interface-only stub)

## UX expectations (Phase 1)

- App remains usable offline after initial load.
- Refresh should restore last local state immediately.
- Existing projection/import/position workflows should behave the same from user perspective.
- If local persistence fails, show explicit non-silent error.

## Migration and rollback

- Keep existing local API files in repo to allow rollback/testing.
- Migration is additive:
  - local-first mode reads from IndexedDB first
  - legacy `/api/state` import is one-time bootstrap path
- Add a developer toggle (env flag) to force legacy API mode during transition if needed.

## Acceptance criteria

1. New user can use app with no backend process running and data persists across refresh.
2. Existing user data can be migrated from legacy local API payload on first run.
3. `revision` increments on every persisted mutation.
4. App loads successfully offline after prior online visit.
5. No existing feature regressions in:
   - projections
   - positions editing/import
   - notes and transactions editing

## Implementation notes (next step)

Initial coding tasks for this branch:
1. Add `StateRepository` abstraction and IndexedDB implementation.
2. Switch `src/stores/app.js` load/save paths to repository.
3. Add migration loader from current `src/services/stateApi.js`.
4. Add PWA manifest/service worker baseline.
5. Add targeted tests/manual verification checklist for offline + refresh behavior.

## Manual verification checklist

Use this checklist to confirm Phase 1 is complete before moving on to Drive sync work.

### Offline + refresh checks
- [ ] Open the app once while online and let state persist to IndexedDB.
- [ ] Refresh the page and confirm the state is restored without a backend process.
- [ ] Stop the local Node API server and reload the app; verify the app still boots from local state.
- [ ] Confirm the app still loads its shell from the service worker cache when offline.
- [ ] Re-open the app after a cold start and verify previous data remains available.

### Migration checks
- [ ] Load the app in a browser with no existing IndexedDB state and confirm legacy `/api/state` import runs once.
- [ ] Confirm `revision` is created and increments on subsequent saves.
- [ ] Verify `updatedAt` and `updatedByDevice` are populated on first save.

### Regression checks
- [ ] Confirm projections still calculate correctly after a local state reload.
- [ ] Confirm import/position workflows still work with the local-first persistence path.
- [ ] Confirm notes and transaction editing remain stable after a refresh.
