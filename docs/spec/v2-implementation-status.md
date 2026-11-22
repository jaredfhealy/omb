# v2 Implementation Status

Last verified: 2026-11-22

Track delivery progress against the v2 model and fresh-start cutover.

## Code quality and documentation

- [x] All functions in stateRepository.js have JSDoc blocks (@param, @returns, @description)
- [x] All functions in stateRepository.js have inline notes explaining purpose and reasoning
- [ ] Projection engine refactor includes JSDoc on all new functions
- [ ] All v2 collection builders and validators have JSDoc

**REQUIREMENT**: All new functions added during v2 implementation MUST include:
1. JSDoc block above function declaration with @param, @returns, and @description/@purpose
2. Inline comments explaining the "why" (not just "what") of complex logic
3. References to relevant spec documents when behavior is spec-driven
4. Cross-references between related functions via @see tags

This ensures the codebase remains maintainable and contributors don't need to reverse-engineer intent from specs.

## Model and persistence

- [ ] v2 schema approved ([data-model-v2.md](./data-model-v2.md))
- [x] IndexedDB/object-store layout finalized
- [x] `meta.dataModel = 'v2'` persisted
- [x] startup manual-recovery handling implemented (no auto-reset/auto-seed on unrecognized local state)
- [x] v2 startup detection logic fixed (strict model marker + startup shape validation)

## Import and source ledger

- [x] transaction-history import writes to `importedTransactions`
- [x] stable `sourceFingerprint` matching implemented (normalized-field hashing + deterministic collision handling)
- [x] `sourceLine` and `executionOrder` semantics documented and implemented (`executionOrder` is canonical; `sourceLine` is traceability only)

## Cash flows and projections

- [ ] cash-flow CRUD migrated to `cashFlows`
- [x] broker cash checkpoint persistence implemented (`cashCheckpoints`, manual source)
- [x] cash checkpoint CRUD UI implemented (tabular manager with add/edit/delete)
- [x] cash checkpoints normalized to date-only precision (`asOfDate` only; no `asOfTime`)
- [x] manual checkpoint entry removed from import modal (managed exclusively in Checkpoints tab)
- [x] `cashFlows.isProjected` + `sourceTransactionId` rules enforced
- [x] projection engine consumes v2 cash-flow + position sources
- [x] projection engine no longer depends on nested raw rows in `actuals[].data[]`
- [x] projection calculation refactor complete per [projection-engine-v2-detailed.md](./projection-engine-v2-detailed.md) spec
  - [x] Implemented calculateProjectionsV2() with per-week iteration algorithm
  - [x] Integrated helper functions: buildActualGrowthMap, buildPositionCollateralMap, buildCashFlowsMap
  - [x] Added margin-aware collateral tracking (critical fix for v1 bug)
  - [x] Explicit position lifecycle tracking (opened/closed by week)
  - [x] Backward-compatible output shape (supports existing components)
  - [x] Trailing averages (4-week, 8-week, all-time) computed from actual data only
  - [x] Switched all calls from calculateProjections (v1) to calculateProjectionsV2 (v2)
  - [x] Verified working: yearly summary, weekly details, reporting charts

## Positions

- [x] `positions.sourceTransactionId` required and enforced
- [x] `relPositionTransactions` implemented for position traceability/FIFO allocation linkage
- [ ] decision to exclude `positions.executionOrder` validated in implementation

## Trade Desk

- [x] `trades` CRUD implemented
- [x] `trades.sourceTransactionId` required and enforced
- [x] `relTradeTransactions` CRUD implemented
- [x] source-transaction exclusivity enforced per trade lifecycle
- [x] trade profitability calculations implemented and validated

## Cleanup and consistency

- [x] v1 assumptions removed from runtime startup path
- [x] app account shape no longer materializes legacy `actuals` / `sells` arrays at runtime
- [ ] terminology consistency pass completed (Cash Flow vs Source transaction)
- [x] startup integrity validation and explicit error surfacing implemented

## Behavior updates (v2 cutover)

- Unrecognized local payloads now block runtime startup and redirect to Data Manager recovery guidance.
- Startup no longer auto-resets or auto-seeds persisted local data.
- Data Manager provides an explicit “Load Starting Account” initialization path; persistence occurs only after Apply Changes.
- Weekly snapshot modal now supports in-modal week navigation (previous/next) and route state persistence (`wsWeek`, `wsTab`).
- Weekly projection view state now supports route persistence for range/selection/scroll (`wwf`, `wws`, `wwscr`).
- Tab route behavior preserves non-tab query parameters during cross-tab navigation; tab switches only mutate `tab`.
