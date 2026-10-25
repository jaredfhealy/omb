# Trade Desk and Trade Sequence Profitability

Last verified: 2026-10-24

This document defines the Trade Desk workflow and its v2 data-model requirements.

## Problem statement

Current position-level premium allocation fields are too coarse for multi-leg sequences, changing strikes/quantities, and partial attribution. Trade Desk introduces explicit source-transaction linkage and trade lifecycle tracking.

## Goals

1. Provide a dedicated Trade Desk surface for defining, reviewing, and closing trade sequences.
2. Enforce exclusive allocation: a source transaction can belong to at most one trade lifecycle.
3. Keep trade scope single-symbol (`TQQQ` trade cannot include `SOXL` rows).
4. Calculate trade profitability with time and capital context (weekly ROR, net P/L, duration).
5. Align with v2 collection model and fresh-start cutover behavior.

## Naming and Terminology

- **User-facing page name:** `Trade Desk`
- **Route path (canonical):** `/trade-desk`
- **Trade:** A user-managed strategy lifecycle for one symbol.
- **Source transaction:** A raw imported brokerage transaction record.
- **Trade event:** A trade-ledger entry derived from a linked source transaction (stored in relationship records).

## User stories

1. As a user, I can create a trade for a symbol and assign a label/notes.
2. As a user, I must associate exactly one originating source transaction when creating a trade.
3. As a user, I can link one or more additional source transactions to that trade.
4. As a user, I cannot allocate the same source transaction to multiple trades.
5. As a user, I can view a chronological trade timeline and evaluate profitability.

## UX: Trade Desk page

Add a new route/page (`/trade-desk`) with three coordinated regions:

1. **Trade list panel**
   - filters: open/closed/all, symbol, date range
   - summary columns: symbol, status, start date, end date, weeks, capital at risk, net P/L, weekly ROR
   - implementation should use existing shared table patterns/components (notably `components/custom/DataTable.vue`) for layout, slots, tooltips, and responsive behavior consistency
2. **Trade detail panel**
   - lifecycle timeline (oldest -> newest)
   - exposure summary (shares/options obligations)
   - profitability card with formulas and denominator transparency
   - detail interactions should follow existing modal-based patterns and conform to established sizing, margin, and spacing conventions used across current modals
3. **Unallocated activity panel**
   - symbol-scoped list of eligible unallocated source transactions
   - batch link/unlink actions
   - visual lock indicator for already allocated rows

## Data model integration (v2)

Trade Desk uses these v2 collections (see [data-model-v2.md](./data-model-v2.md)):

- `trades`
- `relTradeTransactions`
- `importedTransactions`

### Trade

```js
{
  id: String,
  accountId: String,
  sourceTransactionId: String, // required origin transaction
  symbol: String,
  status: 'open' | 'closed',
  openedAt: 'YYYY-MM-DD',
  closedAt: 'YYYY-MM-DD' | null,
  name: String | null,
  notes: String | null,
  createdAt: ISOString,
  updatedAt: ISOString
}
```

### Trade relationship record

```js
{
  id: String,
  accountId: String,
  tradeId: String,
  sourceTransactionId: String,
  eventDate: 'YYYY-MM-DD',
  eventWeek: Number | null,
  eventKind: String,
  cashImpact: Number,
  quantity: Number | null,
  notes: String | null,
  metadata: Object | null,
  createdAt: ISOString,
  updatedAt: ISOString
}
```

Notes:
- relationship table naming convention is `rel<Entity>Transactions`.
- no role/anchor flag is required in v2; originating linkage is derived from `trades.sourceTransactionId`.

## Constraint rules

1. `trades.sourceTransactionId` is required and must reference an imported transaction in the same account.
2. `relTradeTransactions.tradeId` must reference an existing trade in the same account.
3. `relTradeTransactions.sourceTransactionId` must reference an existing imported transaction in the same account.
4. A source transaction can be linked to at most one trade lifecycle.
5. Trade symbol must match linked source transaction symbol when transaction symbol is non-empty.
6. Deleting a trade removes only relationship records and trade metadata; source transactions remain unchanged.

## Calculation model

### 1) Net profit/loss

`netPL = sum(relTradeTransactions.cashImpact) + unrealizedAdjustment`

- MVP default: `unrealizedAdjustment = 0` for closed-trade scoring.
- Open-trade view may optionally include mark-to-market estimate if price data exists.

### 2) Duration

- `startDate = min(related eventDate values)`
- `endDate = status === 'closed' ? max(related eventDate values) : today`
- `weeks = max(1, ceil((endDate - startDate + 1 day) / 7))`

### 3) Capital at risk

Phase 1 baseline:
- `capitalAtRisk = max(runningRequiredCapital)` over lifecycle snapshots.
- for CSP legs, required capital uses strike * contracts * 100 when available; fallback to assignment cash outlay.
- for covered-call legs after assignment, required capital uses share cost basis tied to assigned shares.

If required-capital inference is unavailable for an event, mark metric as partial and surface that state in UI.

### 4) Weekly ROR

- `weeklyROR = (netPL / capitalAtRisk) / weeks * 100`
- show `N/A` when `capitalAtRisk <= 0` or denominator inputs are incomplete.

## Import integration

- import writes source-of-truth brokerage rows to `importedTransactions`.
- Trade Desk consumes imported rows and does not alter import parsing rules.
- new imports should auto-surface unallocated candidates in Trade Desk.
- re-import should preserve links when `sourceFingerprint` matches.

## Cutover alignment

Trade Desk implementation follows [fresh-start-cutover.md](./fresh-start-cutover.md).

## API/store surfaces (proposed)

- collections:
  - `trades`
  - `relTradeTransactions`
- getters:
  - `currentTrades`
  - `unallocatedSourceTransactionsBySymbol(symbol)`
- actions:
  - `createTrade(payload)`
  - `updateTrade(id, patch)`
  - `deleteTrade(id)`
  - `linkSourceTransactionsToTrade(tradeId, sourceTransactionIds[])`
  - `unlinkTradeTransactions(relIds[])`
  - `recalculateTradeMetrics(tradeId)`

## Acceptance criteria (MVP)

1. A source transaction can be linked to at most one trade.
2. A trade cannot be created without an originating `sourceTransactionId`.
3. Trade detail shows deterministic net P/L, duration weeks, and weekly ROR (or explicit `N/A` with reason).
4. Imported new rows appear as unallocated candidates without data loss.
5. Existing projection and position workflows continue to function.

## Open questions

1. Should trade close state be user-controlled, auto-detected, or hybrid?
2. Should Trade Desk metrics feed reporting charts in phase 1 or phase 2?
