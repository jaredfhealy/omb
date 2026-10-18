# UI Behavior and Interaction Rules

Last verified: 2026-10-14

## Layout and scrolling

- Root page should not introduce global scrolling from table-heavy views.
- Inner data regions (table/list/modal body regions) own scrolling behavior.

## Tab patterns

- Use consistent Bootstrap `nav-tabs` + tab-panel pattern for multi-mode surfaces.
- Keep panel seams visually connected (tab strip and tab body should align).
- Refresh persistence uses route query state:
  - `tab` for active tab (`yearly`, `weekly`, `recurring`, `positions`)
  - `pf` for positions status filter (`open`, `recent`, `closed`, `all`)
  - `symbols` as comma-separated symbol chips for positions filtering
- Query state is tab-scoped: when navigating away from Positions, positions-only query params (`pf`, `symbols`) are removed.
- Invalid/unknown query-state values should sanitize to defaults (for example, tab defaults to `yearly`, positions filter defaults to `open`).

## Position workflows

- Position editing modal exposes summary + details with mobile-optimized spacing.
- “Associated Closing Transactions” is expandable and defaults open.
- Position editing allows `offsettingProfits` to be entered as either positive (credit) or negative (debit); the field is optional and blank is normalized to `0` on save.
- `offsettingProfits` is manual and is not auto-calculated from import sequencing, sells, or start-week/profit-allocation edits.
- Allocations shown should respect sequencing and transaction type semantics.
- Positions list ordering should be newest-to-oldest by opening execution (initial buy or short-open event).
- Position status filters include `Open`, `Recent`, `Closed`, and `All`; `Recent` shows lots with open or close activity in the last 30 days and includes a tooltip clarifying the 30-day window.
- Manual delete controls (trash icon) should appear only for user-created manual positions.
- Imported/system-generated positions (including short lots created from `sell short`) should not be treated as manual/deletable.

## Weekly workflows

- Weekly modal presents summary/positions and transactions via tabbed layout.
- Raw transaction counts and note affordances should be visible from the weekly table.

## Import workflows

- After a successful transactions import or positions import, the app marks a pending refresh and reloads only when the user closes the import modal (Close/OK action), so results can be reviewed first.
