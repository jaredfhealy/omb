# Import Sequencing and Allocation

Last verified: 2026-10-14

This document defines the required transaction import behavior for Schwab CSV data.

## Normalization rules

1. Parse all rows from CSV data section (excluding header).
2. Effective trade date:
   - If date value contains `"as of"`, use the trailing `as of` date as effective date.
   - Otherwise use the leading date value.
3. Ignore zero-amount Journal rows.
4. Preserve execution ordering:
   - Normalize newest-first exports to oldest-first processing.
   - Preserve in-day execution sequence from source ordering.
   - Assign an internal execution sequence number and use it for matching decisions.

## Categorization

- `buy` → buy-side execution
- `sell` → long-closing execution
- `sell short` → short-opening execution
- transfer/journal categories remain transaction records as configured in brokerage map

## Lot matching rules

### Short lifecycle

- `sell short` opens a short lot:
  - create a position lot with negative `costBasis`
  - mark as system-imported (not manual/deletable from manual controls)
  - create a sell record with remaining short shares to cover

### Offsetting profits

- Offsetting profits are manual position metadata entered by the user.
- Import initializes lots with `offsettingProfits = 0` and does not auto-populate from transaction rows.
- Offsetting profits can be positive (credit) or negative (debit) and may apply to both long and short lots.

### Buy processing

- A `buy` first covers older open short lots for the same symbol (FIFO by execution sequence).
- If buy quantity exceeds required short cover:
  - create a new long lot for remaining positive shares.

### Sell processing

- A `sell` closes older open long lots for the same symbol (FIFO by chronology + sequence).
- A closing sell must not allocate to lots that were opened after that sell in execution order.

## Display semantics

- “Associated Closing Transactions” should only include valid chronological close allocations.
- Short-opening rows are not shown as long-closing allocations.
- Short lot P/L and ROR are computed from short economics:
  - `Raw P/L = entry proceeds - (cover cost + open short liability)`
  - `Net P/L = Raw P/L + offsettingProfits`
  - `ROR = Net P/L / abs(costBasis)`

## Metadata persistence across re-imports

- Position overrides are stored in account `positionMeta` sidecar entries.
- Matching key includes deterministic lot identity plus execution-order discriminator.
- Matching supports base-identity fallback (same identity, different sequence token) to preserve overrides when sequence tokens shift across imports.
- On import/load, sidecar overrides are re-applied to matching lots so user overrides persist.
- During transaction import, overrides are re-applied again after all lot creation and sell-allocation steps complete (final pass before save) so end-of-import state reflects persisted metadata immediately.
- `Delete all data` import clears market rows/lots but preserves `positionMeta` sidecar entries.
