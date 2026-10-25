# v2 Implementation Status

Last verified: 2026-10-24

Track delivery progress against the v2 model and fresh-start cutover.

## Model and persistence

- [ ] v2 schema approved ([data-model-v2.md](./data-model-v2.md))
- [ ] IndexedDB/object-store layout finalized
- [ ] `meta.dataModel = 'v2'` persisted
- [ ] one-time non-v2 reset alert + reset flow implemented

## Import and source ledger

- [ ] transaction-history import writes to `importedTransactions`
- [ ] stable `sourceFingerprint` matching implemented
- [ ] `sourceLine` and `executionOrder` semantics documented and tested

## Cash flows and projections

- [ ] cash-flow CRUD migrated to `cashFlows`
- [ ] `cashFlows.isProjected` + `sourceTransactionId` rules enforced
- [ ] projection engine consumes v2 cash-flow + position sources
- [ ] projection engine no longer depends on nested raw rows in `actuals[].data[]`

## Positions

- [ ] `positions.sourceTransactionId` required and enforced
- [ ] `relPositionTransactions` implemented for position traceability/FIFO allocation linkage
- [ ] decision to exclude `positions.executionOrder` validated in implementation

## Trade Desk

- [ ] `trades` CRUD implemented
- [ ] `trades.sourceTransactionId` required and enforced
- [ ] `relTradeTransactions` CRUD implemented
- [ ] source-transaction exclusivity enforced per trade lifecycle
- [ ] trade profitability calculations implemented and validated

## Cleanup and consistency

- [ ] v1 assumptions removed from docs and code paths
- [ ] terminology consistency pass completed (Cash Flow vs Source transaction)
- [ ] startup integrity validation and explicit error surfacing implemented
