# UI Behavior and Interaction Rules

Last verified: 2026-10-14

## Layout and scrolling

- Root page should not introduce global scrolling from table-heavy views.
- Inner data regions (table/list/modal body regions) own scrolling behavior.

## Tab patterns

- Use consistent Bootstrap `nav-tabs` + tab-panel pattern for multi-mode surfaces.
- Keep panel seams visually connected (tab strip and tab body should align).

## Position workflows

- Position editing modal exposes summary + details with mobile-optimized spacing.
- “Associated Closing Transactions” is expandable and defaults open.
- Allocations shown should respect sequencing and transaction type semantics.
- Positions list ordering should be newest-to-oldest by opening execution (initial buy or short-open event).
- Manual delete controls (trash icon) should appear only for user-created manual positions.
- Imported/system-generated positions (including short lots created from `sell short`) should not be treated as manual/deletable.

## Weekly workflows

- Weekly modal presents summary/positions and transactions via tabbed layout.
- Raw transaction counts and note affordances should be visible from the weekly table.
