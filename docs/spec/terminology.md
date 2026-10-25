# Terminology

Last verified: 2026-10-24

This document is the canonical glossary for user-facing and domain terminology used across Operation More Bacon specs and UI copy.

## Usage rules

1. Prefer terms in this document for all new UI labels, help text, and specs.
2. If a concept is not listed here, define it here before broad reuse.
3. Avoid duplicating term definitions in feature specs unless feature-local nuance is required.
4. Keep terminology descriptive and stable; avoid temporary "old/new" mapping language in this glossary.

## Core terms

### Account

The top-level portfolio container with settings, balances, positions, actuals, notes, and related records.

### Projection

A computed week-level record derived from account settings, cash flows, positions, and actual growth data.

### Week

A 1-based period relative to an account's `settings.startDate`.

### Note

A situational note record that targets exactly one record type and record ID via `targetCollection` and `targetId`.

### Position

A stock lot record representing assigned shares or short-lot exposure tracked in the positions workflow.

### Sell record

A persisted sale summary entry associated with weekly/account calculations.

## Cash flow terms

### Cash flow

A balance-impacting entry tracked in the cash-flow workflow. Cash flows may be one-time or recurring and include deposits, withdrawals, transfers, taxes, adjustments, and realized P/L categories.

### Recurring cash flow

A cash flow with a week range and repeated application across projection weeks.

### One-time cash flow

A cash flow that applies to a specific week/event without recurrence.

## Trade Desk terms

### Trade Desk

The route/page for creating and managing trade lifecycles and allocations.

### Trade

A user-managed strategy lifecycle for one symbol, from its originating source transaction to final close.

### Source transaction

A raw imported brokerage transaction record that can be linked to a trade.

### Unallocated source transaction

A source transaction not currently linked to a trade.

### Allocated source transaction

A source transaction linked to exactly one trade and unavailable to other trades.

### Trade event

A trade-ledger entry derived from a linked source transaction and used for timeline and profitability calculations.

### Originating source transaction

The source transaction referenced directly by an entity's `sourceTransactionId` field.

### Relationship collection

A collection named in the `rel<Entity>Transactions` format (for example `relTradeTransactions`) that links entity records to one or more source transactions.
