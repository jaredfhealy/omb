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
3. If non-v2 local data exists, block startup and require explicit reset confirmation.
4. Offer optional local backup export before reset.
5. On confirmation, initialize default v2 seed state.
6. Persist `meta.dataModel = 'v2'`.

## UX requirements

- A one-time blocking reset prompt is required when non-v2 local data is detected.
- Prompt flow must include optional local backup export before reset.
- After reset, app should be immediately usable for manual setup (cash flows, projections, positions, trades).
- Import workflows remain optional, not mandatory.

## Verification checklist

- App initializes valid default v2 state on first launch/reset.
- Old local v1 payloads are not read by v2 runtime flows.
- Startup path is atomic: either v2 state loads, or new v2 state is fully initialized.
- App does not require import completion before normal use.

## Out of scope

- Backward-compatible reads of v1 structures in runtime app flows.
- Data-preserving transforms from v1 local stores to v2 collections.
