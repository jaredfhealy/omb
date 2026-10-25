# Data Model (v2 Target)

Last verified: 2026-10-24

This document defines the target collection-oriented model for the fresh-start v2 implementation.

## Fresh-start policy

- v2 is treated as a fresh app model.
- Existing local v1 data does not need migration and may be re-imported from brokerage exports.
- Active trades will be rebuilt in Trade Desk after v2 cutover.

## Root metadata and model identifier

Persisted state must include a model identifier:

```js
{
  meta: {
    dataModel: 'v2',
    updatedAt: ISOString,
    updatedByDevice: String
  }
}
```

Startup behavior:
- if local data is missing `meta.dataModel === 'v2'`, show a one-time reset alert.
- offer optional local backup/export.
- on user confirmation, overwrite local state with default v2 seed data and continue.

## ID and reference conventions

- Every record uses:
  - `id: string` (32-character lowercase hex)
  - `createdAt: ISOString`
  - `updatedAt: ISOString`
- Foreign keys use named reference fields:
  - `accountId`, `sourceTransactionId`, `tradeId`, `positionId`, etc.
- Entity-level origin linkage uses `sourceTransactionId` consistently.

## Collection boundaries

Day-1 required collections:
- `accounts`
- `importedTransactions`
- `cashFlows`
- `positions`
- `trades`
- `relTradeTransactions`
- `relPositionTransactions`
- `notes`

Deferred collections:
- generic relationship table (deferred intentionally)
- `importBatches` (optional; add when explicit import lineage workflow is needed)

## Source fingerprint specification

`importedTransactions.sourceFingerprint` must be computed from normalized values (not raw text), then hashed.

Normalized input order:
1. `effectiveDate` (`YYYY-MM-DD`)
2. `actionNormalized` (canonical lowercase action)
3. `symbolNormalized` (trimmed uppercase; empty string allowed)
4. `descriptionNormalized` (trim + collapsed internal spaces)
5. `quantityNormalized`
6. `priceNormalized`
7. `amountNormalized`
8. `feesNormalized` (default `0`)
9. `executionOrder`

Collision handling:
- if a hash collision is detected for mismatched core values in the same account scope, append a deterministic suffix token before hashing.

## Ordering semantics

- `sourceLine`: raw CSV row traceability only (not business logic).
- `executionOrder`: canonical normalized sequence used by matching/allocation logic.

If both are present and conflict, business logic must use `executionOrder`.

`positions.executionOrder` is intentionally excluded from v2 persistence unless later validated as necessary.

## Typing rules

- Persist numeric fields as numbers (never numeric strings).
- Persist missing optional values as `null` (not `undefined` or sentinel text).
- Persist booleans as true booleans only.
- Persist `date` as `YYYY-MM-DD`; timestamps as ISO strings.
- Parse and normalize once at import boundary before persistence.

## Collections

### accounts

```js
{
  id: String,
  name: String,
  description: String | null,
  formatKey: String,
  settings: {
    startDate: 'YYYY-MM-DD',
    startingBalance: Number,
    weeklyReturn: Number,
    years: Number
  },
  createdAt: ISOString,
  updatedAt: ISOString
}
```

### importedTransactions

Canonical brokerage ledger; one record per imported row.

```js
{
  id: String,
  accountId: String,
  sourceFingerprint: String,
  sourceLine: Number | null,
  executionOrder: Number,
  week: Number | null,
  date: 'YYYY-MM-DD',
  action: String,
  symbol: String,
  description: String,
  quantity: Number,
  price: Number,
  amount: Number,
  fees: Number | null,
  raw: Object | null,
  createdAt: ISOString,
  updatedAt: ISOString
}
```

### cashFlows

Projection-impacting entries (one-time or recurring).

```js
{
  id: String,
  accountId: String,
  sourceTransactionId: String | null, // required for historical imported cash flows
  type: 'deposit' | 'withdrawal',
  category: 'income' | 'taxes' | 'transfer' | 'adjustment' | 'realized_PL',
  amount: Number,
  startWeek: Number,
  endWeek: Number | null,
  isRecurring: Boolean,
  isProjected: Boolean, // true for user-modeled future entries
  notes: String | null,
  createdAt: ISOString,
  updatedAt: ISOString
}
```

### positions

```js
{
  id: String,
  accountId: String,
  sourceTransactionId: String, // originating imported transaction
  positionKey: String,
  symbol: String,
  shares: Number,
  costBasis: Number,
  currentPrice: Number | null,
  assignedWeek: Number,
  soldWeek: Number | null,
  soldShares: Number,
  sellAmount: Number | null,
  offsettingProfits: Number,
  profitAllocation: Number,
  positionType: 'long' | 'short' | null,
  manual: Boolean,
  createdAt: ISOString,
  updatedAt: ISOString
}
```

### trades

```js
{
  id: String,
  accountId: String,
  sourceTransactionId: String, // originating imported transaction
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

### relTradeTransactions

Relationship collection linking trades to imported transactions used in the trade lifecycle.

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

Note:
- no role/anchor flag is included in v2.
- the originating trade transaction is derived from `trades.sourceTransactionId`.

### relPositionTransactions

Relationship collection linking positions to imported transactions (opening/closing/adjustment traceability).

```js
{
  id: String,
  accountId: String,
  positionId: String,
  sourceTransactionId: String,
  eventDate: 'YYYY-MM-DD',
  eventWeek: Number | null,
  eventKind: String,
  quantity: Number | null,
  allocatedShares: Number | null,
  allocatedAmount: Number | null,
  notes: String | null,
  metadata: Object | null,
  createdAt: ISOString,
  updatedAt: ISOString
}
```

### notes

```js
{
  id: String,
  accountId: String,
  targetCollection: String, // e.g. 'weeks', 'cashFlows', 'trades', 'positions', 'importedTransactions'
  targetId: String,         // scoped by accountId
  noteText: String,
  createdAt: ISOString,
  updatedAt: ISOString
}
```

## Integrity constraints

### Write-time enforcement (required)

1. `trades.sourceTransactionId` must reference an existing `importedTransactions` record in same account.
2. `positions.sourceTransactionId` must reference an existing `importedTransactions` record in same account.
3. `relTradeTransactions.tradeId` must reference an existing trade in same account.
4. `relPositionTransactions.positionId` must reference an existing position in same account.
5. `rel*Transactions.sourceTransactionId` must reference an existing imported transaction in same account.
6. `sourceTransactionId` in `relTradeTransactions` can be linked to at most one trade.
7. trade and linked transaction symbols must match when transaction symbol is non-empty.
8. if `cashFlows.isProjected === false`, `cashFlows.sourceTransactionId` is required.
9. if `cashFlows.isProjected === true`, `cashFlows.sourceTransactionId` must be null.
10. `notes.targetCollection` and `notes.targetId` are required.
11. `notes.targetId` must reference a valid record in `notes.targetCollection` for the same account (except `targetCollection = 'weeks'`, where `targetId` is the week number string).

### Startup validation (required)

Run integrity validation on startup as a safety net. Violations must surface explicit errors and must not be silently ignored.
