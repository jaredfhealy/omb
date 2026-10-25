# Fresh-Start v2 Cutover

Last verified: 2026-10-24

This document defines v2 cutover behavior for a fresh-start release (no data migration path).

## Policy

- No v1 -> v2 migration is required.
- Existing local data may be reset.
- Users may optionally export a backup before reset.

## Startup contract

1. On startup, read local metadata.
2. If `meta.dataModel === 'v2'`, continue normally.
3. If `meta.dataModel` is missing or not `v2`, show a one-time blocking alert:
   - explain that the local data model changed
   - offer optional export/backup action
   - offer "Proceed with reset" action
4. On user confirmation, clear old local data and initialize default v2 seed state.
5. Persist `meta.dataModel = 'v2'`.

## UX requirements

- Reset alert is shown only before successful v2 initialization.
- Export/backup failure must be surfaced explicitly and must not block reset.
- After reset, app should be immediately usable for manual setup (cash flows, projections, positions, trades).
- Import workflows remain optional, not mandatory.

## Verification checklist

- App initializes valid default v2 state on first launch/reset.
- Old local v1 payloads are not partially read by v2 flows.
- Reset path is atomic: either old state remains untouched, or new v2 state is fully initialized.
- App does not require import completion before normal use.

## Out of scope

- Backward-compatible reads of v1 structures.
- Data-preserving transforms from v1 local stores to v2 collections.
