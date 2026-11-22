# Trade Desk and Trade Sequence Profitability

Last verified: 2026-11-22

This document defines current Trade Desk behavior and its v2 data-model constraints.

## Purpose

Trade Desk provides explicit source-transaction linkage and lifecycle tracking for single-symbol trade sequences.

## Navigation and workspace location

- **User-facing name:** `Trade Desk`
- **Primary location:** first tab in the main `/` workspace (`tab=trades`)
- **Legacy route compatibility:** `/trade-desk` redirects to `/?tab=trades`

## Core behavior

1. A trade is created from selected activity where the oldest selected row becomes the originating source transaction.
2. Additional source transactions can be linked/unlinked from the trade.
3. Source transactions are exclusive to one trade lifecycle.
4. Trade activity is timeline-first (oldest to newest) with grouped and raw views.
5. Trade metrics are derived from linked source rows and linked position context.

## Workspace surfaces

Trade Desk uses three coordinated surfaces:

1. **Trade list panel**
   - filters: open/closed/all, symbol
   - summary fields: symbol, status, lifecycle, weeks, capital at risk, net P/L, weekly ROR
2. **Trade detail slide-out panel**
   - performance tab with lifecycle, capital, cost basis context, and P/L outlook table
   - activity tab with grouped/raw linked activity and link/unlink actions
   - notes tab for trade-scoped notes
   - contextual action to open the linked position editor when open stock exposure exists
3. **Link Activity stacked panel**
   - opens over Trade Details
   - symbol/qty/strike/type/date filtering
   - multi-select linking flow for create and edit paths

## Data model integration (v2)

Trade Desk uses:

- `trades`
- `relTradeTransactions`
- `importedTransactions`

See [data-model-v2.md](./data-model-v2.md) for canonical collection schemas.

### Trade record

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

## Constraints

1. `trades.sourceTransactionId` is required and must reference an `importedTransactions` row in the same account.
2. `relTradeTransactions.tradeId` and `relTradeTransactions.sourceTransactionId` must reference records in the same account.
3. A source transaction can be linked to at most one trade lifecycle.
4. Trade symbol must match linked source transaction symbol when the source symbol is non-empty.
5. Deleting a trade removes trade metadata and relations; source transactions remain.

## Metrics model

### Net P/L

- `netPL` is the sum of linked trade cash impacts.
- For open-trade list display, net premiums are used when available.

### Duration

- `startDate = min(eventDate)`
- `endDate = max(eventDate)` for closed trades, otherwise current terminal date
- `weeks = max(1, ceil((endDate - startDate + 1 day) / 7))`

### Capital at risk

- inferred from linked put collateral, linked open-position basis, or linked stock transaction basis (in that precedence path)
- marked partial/incomplete when denominator inference is unavailable

### Weekly ROR

- `weeklyROR = (netPL / capitalAtRisk) / weeks * 100`
- `N/A` when denominator inputs are incomplete or non-positive

## Import behavior

1. New imports surface new unallocated candidates in Link Activity.
2. Re-import preserves trade linkage when `sourceFingerprint` identity matches.
3. Synthetic `manual-seed` source rows are used for manual-position origin continuity when applicable.

## Store/API surfaces

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
