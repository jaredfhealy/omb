# v2 Implementation Status

Last verified: 2026-10-25

Track delivery progress against the v2 model and fresh-start cutover.

## Model and persistence

- [ ] v2 schema approved ([data-model-v2.md](./data-model-v2.md))
- [x] IndexedDB/object-store layout finalized
- [x] `meta.dataModel = 'v2'` persisted
- [x] v2-only startup path implemented (no runtime v1 reset prompt)

## Import and source ledger

- [x] transaction-history import writes to `importedTransactions`
- [ ] stable `sourceFingerprint` matching implemented
- [ ] `sourceLine` and `executionOrder` semantics documented and tested

## Cash flows and projections

- [ ] cash-flow CRUD migrated to `cashFlows`
- [ ] `cashFlows.isProjected` + `sourceTransactionId` rules enforced
- [ ] projection engine consumes v2 cash-flow + position sources
- [x] projection engine no longer depends on nested raw rows in `actuals[].data[]`

## Positions

- [ ] `positions.sourceTransactionId` required and enforced
- [x] `relPositionTransactions` implemented for position traceability/FIFO allocation linkage
- [ ] decision to exclude `positions.executionOrder` validated in implementation

## Trade Desk

- [ ] `trades` CRUD implemented
- [ ] `trades.sourceTransactionId` required and enforced
- [ ] `relTradeTransactions` CRUD implemented
- [ ] source-transaction exclusivity enforced per trade lifecycle
- [ ] trade profitability calculations implemented and validated

## Cleanup and consistency

- [x] v1 assumptions removed from runtime startup path
- [x] app account shape no longer materializes legacy `actuals` / `sells` arrays at runtime
- [ ] terminology consistency pass completed (Cash Flow vs Source transaction)
- [x] startup integrity validation and explicit error surfacing implemented
