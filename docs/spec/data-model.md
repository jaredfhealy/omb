# Data Model (v1 Baseline)

Last verified: 2026-10-24

This document is the frozen baseline of the current runtime model (v1). It exists to preserve a clear reference while the v2 redesign is implemented.

For the target model, see [data-model-v2.md](./data-model-v2.md).

## v1 persistence container

Primary runtime persistence in v1 is a single IndexedDB envelope:

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

## v1 top-level shape

```js
{
  accounts: Account[]
}
```

## v1 account shape (core fields)

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
  transactions: CashFlow[],
  actuals: ActualWeek[],
  positions: Position[],
  sells: SellRecord[],
  notes: WeekNote[],
  positionMeta: PositionMeta[]
}
```

Note: v1 persisted key is `transactions`; domain terminology now refers to these records as cash flows.

## v1 position shape

```js
{
  positionKey: String,
  symbol: String,
  executionOrder: Number | undefined,
  shares: Number,
  costBasis: Number,
  currentPrice: Number,
  assignedWeek: Number,
  soldWeek: Number | null,
  soldShares: Number,
  sellAmount: Number,
  offsettingProfits: Number,
  startWeek: Number | null,
  profitAllocation: Number,
  manual: Boolean | null,
  positionType: 'short' | undefined
}
```

## v1 known gaps tracked for v2

1. Raw imported brokerage rows are nested under `actuals[].data[]` instead of a centralized ledger collection.
2. Ordering/traceability fields need clarification and de-duplication (`sourceLine`, `executionOrder`, position-level ordering carryover).
3. Trade lifecycle modeling requires first-class collections (`trades`, `relTradeTransactions`) and source-transaction linkage constraints.
4. Single-envelope persistence makes partial updates/querying more expensive than collection-oriented storage.
