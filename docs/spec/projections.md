# Projections Engine

Last verified: 2026-10-14

## Source of truth

- Display rows are computed from account state, not persisted as primary records.
- Projection recomputation is triggered after data mutations/import/save flows.

## Weekly row model (conceptual)

Per week, projection logic derives:

- `startCashBalance`
- net recurring cash flows
- share-balance effects from position lifecycle
- actual-vs-projected growth choice
- `endBalance`
- rolling metrics (4-week/8-week/all-time averages where applicable)

## Behavior rules

- Past/current weeks prefer actual outcomes when available.
- Future weeks use projected return settings.
- Changes to positions/cash flows/settings recalculate dependent rows.
