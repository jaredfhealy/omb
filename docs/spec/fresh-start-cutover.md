# Fresh-Start v2 Cutover

Last verified: 2026-10-31

This document defines v2 cutover behavior for a fresh-start release (no data migration path).

## Policy

- No v1 -> v2 migration is required.
- Existing local data is not read by runtime app flows.
- v2 is treated as the baseline model for this app iteration.

## Startup contract

1. On startup, read v2 metadata/object stores only.
2. If `meta.dataModel === 'v2'`, continue normally.
3. If local persistence is missing/unrecognized/invalid, block normal runtime startup.
4. Redirect to Data Manager with recovery guidance.
5. Initialization is explicit and user-driven: load the starting account seed in Data Manager and apply changes.
6. Persist `meta.dataModel = 'v2'` only when user applies valid data.

## UX requirements

- Startup must never auto-reset or auto-seed over unrecognized data.
- Recovery instructions should surface in Data Manager only when startup is blocked.
- After initialization via Data Manager, app should be immediately usable for manual setup (cash flows, projections, positions, trades).
- Import workflows remain optional, not mandatory.

## Verification checklist

- App does not auto-initialize persisted state during blocked startup.
- Old local v1 payloads are not read by v2 runtime flows.
- Startup path is atomic: either v2 state loads, or app remains blocked until explicit Data Manager action.
- App does not require import completion before normal use.

## Out of scope

- Backward-compatible reads of v1 structures in runtime app flows.
- Data-preserving transforms from v1 local stores to v2 collections.
