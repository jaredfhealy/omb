# Operation More Bacon Specs

Last verified: 2026-10-24

This folder is the canonical product and engineering spec set for the local-only app.

## Spec map

- [Architecture](./architecture.md)
- [Data Model (v1 Baseline)](./data-model.md)
- [Data Model (v2 Target)](./data-model-v2.md)
- [Fresh-Start v2 Cutover](./fresh-start-cutover.md)
- [Import Sequencing and Allocation](./import-sequencing-and-allocation.md)
- [Local-First PWA + Drive Sync (Phase 1)](./local-first-pwa-drive-phase1.md)
- [Projections Engine](./projections.md)
- [Terminology](./terminology.md)
- [Trade Desk and Trade Sequence Profitability](./trade-desk.md)
- [UI Behavior and Interaction Rules](./ui-behavior.md)
- [v2 Implementation Status](./v2-implementation-status.md)

## Usage rules

1. Keep behavioral changes and spec changes in the same PR.
2. Prefer domain/workflow specs over per-component duplication.
3. If a decision is durable and architectural, add/update an ADR in [../adr/](../adr/README.md).
