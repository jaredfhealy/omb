# Operation More Bacon — Copilot Instructions

## Project Purpose
A Vue 3 + local API personal finance app focused on **weekly options trading income projection**. Users track cash balances, recurring deposits/withdrawals, assigned stock positions (cash-secured puts, etc.), and compare actual weekly trading results against a projected growth curve. Supports multiple brokerage accounts and CSV import from Schwab.

---

## Tech Stack

| Dependency | Purpose |
|---|---|
| Vue 3 (`<script setup>` / Composition API) | UI framework |
| Pinia | Global state management |
| Vue Router 4 | Client-side routing |
| Node.js + Express | Local backend API |
| better-sqlite3 (SQLite) | Local persistence |
| Bootstrap 5 + Bootstrap Icons | UI styling |
| Chart.js 4 + vue-chartjs | Charts |
| chartjs-plugin-zoom / annotation | Chart interactivity |
| PapaParse | CSV parsing (Schwab import) |
| html2canvas | Screenshot-to-clipboard |
| Vite | Build tool |

**Dev scripts:**
- `npm run dev` — runs local API server + Vite dev server concurrently
- `npm run server` — local API server only (default port 3001)
- `npm run build` / `npm run preview` — production build

Local persisted data is stored in `./server/data/app.db`.

---

## Local State Payload Structure

The entire app state is stored as one JSON payload row in SQLite `app_state` (id=1) and served by `GET/PUT /api/state`.

```javascript
{
  selectedAccountId: Number,
  lastUpdated: ISO string,
  accounts: [
    {
      id: Number,
      name: String,
      description: String,
      formatKey: String,           // brokerage key e.g. 'schwab'
      settings: {
        startDate: 'YYYY-MM-DD',
        startingBalance: Number,
        weeklyReturn: Number,      // percent, e.g. 1 = 1%
        years: Number              // projection horizon (1–10)
      },
      transactions: [              // recurring deposits/withdrawals
        {
          type: 'deposit' | 'withdrawal',
          category: 'income' | 'taxes' | 'transfer' | 'adjustment' | 'realized_PL',
          startWeek: Number,
          endWeek: Number | null,
          amount: String,
          positionKey: String | null
        }
      ],
      actuals: [                   // weekly actual trading data (from CSV import)
        {
          week: Number,
          growth: Number,
          weekStart: 'YYYY-MM-DD',
          data: [                  // raw brokerage transaction rows
            {
              date: String,
              action: String,
              symbol: String,
              description: String,
              quantity: Number,
              price: Number,
              amount: Number
            }
          ]
        }
      ],
      positions: [                 // assigned stock positions
        {
          positionKey: String,     // unique key: symbol_shares_action_date_amount
          symbol: String,
          shares: Number,
          costBasis: Number,
          currentPrice: Number,
          assignedWeek: Number,
          soldWeek: Number | null,
          sellAmount: Number | null,
          offsettingProfits: Number,
          startWeek: Number,
          profitAllocation: Number, // 0–100 percent
          mergeGroup: String | null, // ID for merged position groups
          manual: Boolean | null
        }
      ],
      sells: [                     // sell records (from CSV import)
        { week: Number, amount: Number }
      ],
      notes: [                     // per-week notes
        { week: Number, weekStart: String, note: String }
      ]
    }
  ]
}
```

**Security model (current):** local-only app; no auth layer.

---

## Pinia Store (`src/stores/app.js`)

The backbone of the application. Contains all state, computed projections, business logic, formatting utilities, and dynamic modal/component references.

### State

| Property | Type | Description |
|---|---|---|
| `db` | Object | Full local state payload loaded from `/api/state` |
| `projections` | Array | Computed weekly rows — recalculated on every data change |
| `loading` | Boolean | Prevents auto-save during initial load |
| `activeTab` | String | `'yearly'` \| `'weekly'` \| `'recurring'` \| `'positions'` |
| `weekFilter` | String | `'all'` \| `'open'` \| `'closed'` |
| `selectedWeek` | Number\|null | Currently selected week for row modal |
| `windowWidth` | Number | Viewport width for responsive logic |

### Getters

- `currentAccount` — finds account by `selectedAccountId`
- `totalWeeks` — total number of weeks (`settings.years * 52`)
- `otherAccounts` — accounts not currently active

### Key Actions

**Local API persistence:**
- `getBaconStash()` — loads full state payload from local API, validates account arrays, triggers `calculateProjections()`
- `saveBacon()` — writes full state payload to local API with `lastUpdated`, then calls `refreshTooltips()`

**Core Business Logic:**
- `calculateProjections()` — main computation engine. Iterates all weeks; for each week:
  - Aggregates `transactions` and `positionDeductions` (from open positions' `profitAllocation`)
  - Calculates `startCashBalance = previousEndBalance + netTransaction`
  - Applies sold/bought position adjustments from previous week
  - Selects actual vs. projected growth (actual for past/current weeks, projected for future)
  - Calculates `endBalance`, trailing 4-week, 8-week, and all-time averages for both growth and ROR
  - Auto-saves via `saveBacon()` after first load
- `calculatePositionPremiums(position)` — sums premiums from `actuals` matching a position's symbol from `startWeek` onwards, applies `profitAllocation` percentage
- `calculateAllPositionPremiums()` — calls above for every position

**Utility / Formatting:**
| Function | Description |
|---|---|
| `formatCurrency(n)` | `$1,234.56` or `($1,234.56)` for negatives |
| `getWeekDateRange(week, html?)` | Date range string or HTML badge for a week number |
| `normalizeDate(str)` | Normalizes to `YYYY-MM-DD` |
| `refreshTooltips()` | Disposes and re-initializes all Bootstrap tooltips |
| `generatePositionKey(...)` | Deterministic position key string |
| `getWeekDates(week)` | Returns start/end ISO strings for a week |
| `getWeekNumber(date)` | Converts date to 1-based week number relative to account start |
| `getCurrentWeek()` | Current week number based on today vs. account start date |
| `getBrokerageFormat(key)` | Returns column config for known brokerages (currently: Schwab) |

### Store-Attached Functions Pattern

A key architectural pattern: modals and components **attach their own methods to the store at mount time** so any component can trigger them without prop-drilling. The store holds these as plain refs that are `null` until the component mounts.

```javascript
// Set by components at mount, called from anywhere via store.*
store.confirm             // ConfirmModal — global confirm dialog
store.showPositionModal   // EditPositionModal
store.showManageAccountModal  // ManageAccountModal
store.showEditRowModal    // EditRowModal
store.showTransactionModal // EditTransactionModal
store.showSettingsModal   // SettingsModal
store.showEditAccountModal // EditAccountModal
store.showImportModal     // ImportTransactionsModal
store.refreshYearlySummary
store.refreshWeeklyDetails
store.refreshTransactionManager
store.refreshPositionsManager
store.scrollToCurrentWeek
```

Always guard calls: `if (store.confirm) store.confirm(...)`.

---

## Routing (`src/router/`)

| Path | Component | Access Requirements |
|---|---|---|
| `/` | `Bacon.vue` | No |
| `/reporting` | `Reporting.vue` | No |
| `/summarizer` | `TransactionSummarizer.vue` | No |

All routes are lazy-loaded. Auth guards and auth bootstrap were removed in local-only mode.

---

## Component Inventory

### Views
| File | Description |
|---|---|
| `views/Bacon.vue` | Main app view (`/`). Thin wrapper around `BalanceProjector`. |
| `views/Reporting.vue` | Reporting dashboard. Renders all 4 charts. Has local chart-type toggle. |
| `views/tools/TransactionSummarizer.vue` | Standalone CSV transaction summarizer. Groups roll pairs, calculates per-trade ROR, supports week-range filtering and image copy. |

### Core Components
| File | Description |
|---|---|
| `components/AppNavigation.vue` | Top navbar. Handles account actions, page navigation, and mobile collapse. |
| `components/BalanceProjector.vue` | Primary container for the main view. Mounts Bootstrap listeners, renders tab panels, shows loading overlay. |
| `components/TabNavigation.vue` | Tab bar that sets `store.activeTab`. No props/emits — reads store directly. |
| `components/YearlySummary.vue` | Groups projections into yearly chunks. Shows start balance, deposits, withdrawals, growth, end balance, % change. |
| `components/WeeklyDetails.vue` | Week-by-week data table. Multi-row checkbox selection for summary stats. Scrolls to current week on mount. Row click opens `EditRowModal`; includes a raw-transactions action that opens `WeekRawDataModal`. |
| `components/TransactionManager.vue` | CRUD table for recurring transactions. Filters by `weekFilter` and `selectedWeek`. |
| `components/PositionsManager.vue` | Manages stock positions. Supports merge groups, open/closed filter, manual position add. Collapses merged groups into summary rows. |

### Charts
| File | Description |
|---|---|
| `charts/ActualGrowthChart.vue` | Weekly actual growth + 4/8-week rolling averages. |
| `charts/RORChart.vue` | Weekly ROR % + rolling averages. |
| `charts/TrailingIncomeChart.vue` | Rolling 4-week income sum per week. |
| `charts/BalanceValueSummary.vue` | Compact summary card comparing estimated account value vs. net contributions, including unrealized loss context. |
| `charts/BalanceGrowthChart.vue` | Full balance timeline: actual vs. projected + transaction markers (▲▽●). Uses zoom + annotation plugins. Does **not** use `useChartData` composable. |

### Custom Components
| File | Description |
|---|---|
| `components/custom/DataTable.vue` | Reusable card-based table with sticky header, responsive mobile labels, tooltip support, named slots. See column definition shape below. |

### Modals
| File | Description |
|---|---|
| `modals/ConfirmModal.vue` | Global reusable confirm dialog. Exposes `show(msg, confirmCb, cancelCb)`. |
| `modals/EditAccountModal.vue` | Create/edit account (name, description, settings). |
| `modals/EditPositionModal.vue` | Add/edit stock position. Shows live P&L summary using `positionUtils`. Handles merge group editing. |
| `modals/EditRowModal.vue` | Edit per-week notes. Does not edit growth (that's read-only from actuals). |
| `modals/EditTransactionModal.vue` | Add/edit recurring transaction. Validates type, startWeek, amount. |
| `modals/ImportTransactionsModal.vue` | Multi-step Schwab CSV import. Detects format, categorizes rows, processes positions/sells/transactions, recalculates growth totals. |
| `modals/ManageAccountModal.vue` | Account switcher/manager. Add, edit, delete accounts. JSON backup download and restore. |
| `modals/SettingsModal.vue` | Edit active account settings (startDate, startingBalance, weeklyReturn, years). |
| `modals/WeekRawDataModal.vue` | Per-week transactions snapshot with strategy/net-cash summary and position/transaction tabs. |
| `modals/index.js` | Barrel export of all modals. |

---

## Component Dependency Tree

```
App.vue
├── AppNavigation.vue
├── <router-view>
│   ├── Bacon.vue → BalanceProjector.vue
│   │   ├── TabNavigation.vue
│   │   ├── YearlySummary.vue        → DataTable.vue
│   │   ├── WeeklyDetails.vue        → DataTable.vue
│   │   ├── TransactionManager.vue   → DataTable.vue
│   │   ├── PositionsManager.vue     → DataTable.vue, ConfirmModal.vue
│   │   ├── EditTransactionModal.vue
│   │   ├── EditRowModal.vue
│   │   ├── EditPositionModal.vue
│   │   └── WeekRawDataModal.vue
│   ├── Reporting.vue
│   │   ├── TrailingIncomeChart.vue
│   │   ├── ActualGrowthChart.vue
│   │   ├── RORChart.vue
│   │   ├── BalanceValueSummary.vue
│   │   └── BalanceGrowthChart.vue
│   ├── TransactionSummarizer.vue
│
├── ConfirmModal.vue           (global, mounted in App.vue)
├── SettingsModal.vue          (global)
├── ManageAccountModal.vue     (global)
├── EditAccountModal.vue       (global)
└── ImportTransactionsModal.vue (global)
```

---

## Composables & Utilities

### `useChartData.js`
Accepts `projections` array as parameter. Returns:
- `weeksWithActuals` — computed: filters to weeks with actual data, generates date labels
- `getWeekLabel(i)` / `getWeekData(i)` — accessor helpers
- `rollingAverage(data, window)` — rolling window average
- `average(data)` — simple mean, ignores null/undefined
- `getChartOptions(title, yLabel)` — Chart.js options with responsive config, custom tooltip callbacks (shows week number + date range in tooltip title)

Used by: `ActualGrowthChart`, `RORChart`, `TrailingIncomeChart`. **Not** used by `BalanceGrowthChart`.

### `positionUtils.js`
Pure functions for position P&L calculations. All accept a position object.

| Function | Description |
|---|---|
| `getAssignmentCost(p)` | `shares * costBasis` |
| `getCurrentValue(p)` | Uses `sellAmount` if sold, else `currentPrice * shares` |
| `getCapitalGainLoss(p)` | `getCurrentValue - getAssignmentCost` |
| `getTotalPL(p)` | Capital G/L + `offsettingProfits` |
| `getNetPLPerShare(p)` | `getTotalPL / shares` |
| `getGrossPLPerShare(p)` | `getCapitalGainLoss / shares` |
| `getROR(p)` | `getTotalPL / getAssignmentCost * 100` |
| `getWeeklyROR(p)` | Uses `soldWeek` or current week; range is `soldWeek - startWeek` |

---

## DataTable Column Definition Shape

```javascript
{
  key: String,
  header: {
    text: String,
    tooltip: String,
    tooltipHtml: Boolean
  },
  class: String,
  value: (item) => String,         // default cell renderer
  getTooltip: (item) => String,    // dynamic tooltip per cell
  tooltipHtml: Boolean
}
```

**Props:** `items` (Array, required), `columns` (Array, required), `striped` (Boolean, default true), `getRowAttributes` (Function), `getRowRef` (Function)

**Slots:** `table-controls` (above headers), `[column.key]` (named per column, receives `{ item }`), `row` (full row override), `mobile-header`, `empty`

**Emits:** `row-click`

**Exposes:** `scrollableWindow` ref for programmatic scrolling

---

## Key Conventions

- **`positionKey` format:** `symbol_shares_action_date_amount` — generated by `store.generatePositionKey()`
- **Week numbers** are 1-based, relative to `settings.startDate` of the active account
- **Projection rows** are the source of truth for display — always derived from `calculateProjections()`, never stored directly
- **Auto-save** happens after `calculateProjections()` completes (after initial load flag clears)
- **Option symbol regex:** `/^([\w.-]+) (\d{2}\/\d{2}\/\d{4}) ([\d.]+) ([CP])$/` — used in `TransactionSummarizer` for parsing option contract symbols
- **Brokerage format** is stored as `formatKey` on the account; currently only `'schwab'` is implemented in `getBrokerageFormat()`
- **CSV import sequencing:** preserve effective execution order during import. For Schwab exports (typically newest-first), processing is normalized to oldest-first, and same-day rows preserve their in-day execution sequence.

---

## Adding a New Feature — Checklist

1. **New store state** → add to `state()` in `src/stores/app.js`
2. **New persisted field** → add to the local payload shape and consider migration logic for existing saved payloads
3. **New modal** → follow existing modal pattern (local `isVisible`, `show()`/`close()`, `defineExpose({ show })`), register in `modals/index.js`, mount globally in `App.vue`, attach to store: `store.showMyModal = modalRef.value.show`
4. **New tab** → add tab button in `TabNavigation.vue`, add `v-if` panel in `BalanceProjector.vue`, add tab key to `activeTab` type
5. **Projection changes** → modify `calculateProjections()` in the store; all display components reactively update
6. **New chart** → use `useChartData` composable unless you need full projection history (then read `store.projections` directly, like `BalanceGrowthChart`)
7. **Update this file** when adding new store state, persisted payload fields, global modal patterns, or significant architectural changes
