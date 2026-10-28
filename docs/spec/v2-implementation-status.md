# v2 Implementation Status

Last verified: 2026-10-25

Track delivery progress against the v2 model and fresh-start cutover.

## Model and persistence

- [ ] v2 schema approved ([data-model-v2.md](./data-model-v2.md))
- [x] IndexedDB/object-store layout finalized
- [x] `meta.dataModel = 'v2'` persisted
- [x] startup non-v2 handling implemented (blocking reset flow with optional local backup export)

## Import and source ledger

- [x] transaction-history import writes to `importedTransactions`
- [x] stable `sourceFingerprint` matching implemented (normalized-field hashing + deterministic collision handling)
- [x] `sourceLine` and `executionOrder` semantics documented and implemented (`executionOrder` is canonical; `sourceLine` is traceability only)

## Cash flows and projections

- [ ] cash-flow CRUD migrated to `cashFlows`
- [x] `cashFlows.isProjected` + `sourceTransactionId` rules enforced
- [ ] projection engine consumes v2 cash-flow + position sources
- [x] projection engine no longer depends on nested raw rows in `actuals[].data[]`

## Positions

- [x] `positions.sourceTransactionId` required and enforced
- [x] `relPositionTransactions` implemented for position traceability/FIFO allocation linkage
- [ ] decision to exclude `positions.executionOrder` validated in implementation

## Trade Desk

- [ ] `trades` CRUD implemented
- [x] `trades.sourceTransactionId` required and enforced
- [ ] `relTradeTransactions` CRUD implemented
- [ ] source-transaction exclusivity enforced per trade lifecycle
- [ ] trade profitability calculations implemented and validated

## Cleanup and consistency

- [x] v1 assumptions removed from runtime startup path
- [x] app account shape no longer materializes legacy `actuals` / `sells` arrays at runtime
- [ ] terminology consistency pass completed (Cash Flow vs Source transaction)
- [x] startup integrity validation and explicit error surfacing implemented

## Behavior updates (v2 cutover)

- Non-v2 local payloads now require a blocking reset confirmation during startup.
- Users can export a one-time local JSON backup snapshot before reset.
- Startup reset seeds a clean v2 baseline account and persists `meta.dataModel = 'v2'`.
