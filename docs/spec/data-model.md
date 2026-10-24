# Data Model

Last verified: 2026-10-21

## Persistence container

Primary runtime persistence is an IndexedDB envelope containing:

```js
{
  meta: {
    revision: Number,
    updatedAt: ISOString,
    updatedByDevice: String,
    lastSyncedRevision: Number | null
  },
  data: AppData
}
```

## Top-level shape

`data` shape:

```js
{
  accounts: Account[]
}
```

## Account shape (core fields)

```js
{
  id: Number,
  name: String,
  description: String,
  formatKey: String, // 'schwab'
  settings: {
    startDate: 'YYYY-MM-DD',
    startingBalance: Number,
    weeklyReturn: Number,
    years: Number
  },
  transactions: Transaction[],
  actuals: ActualWeek[],
  positions: Position[],
  sells: SellRecord[],
  notes: WeekNote[],
  positionMeta: PositionMeta[]
}
```

## Position shape (current operational model)

```js
{
  positionKey: String,
  symbol: String,
  executionOrder: Number | undefined, // import execution sequence for ordering/tie-breaks
  shares: Number,
  costBasis: Number,       // May be negative for short lots
  currentPrice: Number,
  assignedWeek: Number,
  soldWeek: Number | null,
  soldShares: Number,
  sellAmount: Number,
  offsettingProfits: Number, // net options contribution; can be positive (credit) or negative (debit)
  startWeek: Number | null,
  profitAllocation: Number,
  manual: Boolean | null, // true only for user-created manual lots
  positionType: 'short' | undefined // when modeled as short lot
}
```

## Data integrity rules

- Week numbers are 1-based relative to account `settings.startDate`.
- `positionKey` must be unique per persisted lot/record.
- Import execution order must be preserved for lot matching logic.

## Position metadata sidecar

`positionMeta` stores position-level overrides that must survive re-imports.

```js
{
  key: String, // deterministic identity: symbol + date + side + shares + basis + executionOrder token
  offsettingProfitsOverride: Number | undefined,
  profitAllocationOverride: Number | undefined,
  createdAt: ISOString,
  updatedAt: ISOString
}
```

Rules:
- Sidecar is keyed independently from `positionKey` so import-created lot keys can be regenerated.
- Sidecar lookup supports base-identity fallback when execution-order token differs.
- Overrides are applied to matching lots during load/import/recalculation.
