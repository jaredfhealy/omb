# ADR 0001: Local-only architecture baseline

Status: Accepted  
Date: 2026-10-14

## Context

The app was migrated from Firebase-backed persistence to a local-first architecture.

## Decision

- Backend: Node.js + Express
- Persistence: SQLite (`better-sqlite3`)
- State strategy: single JSON payload in `app_state` (`id=1`)
- Networking: bind API to `0.0.0.0` for LAN/Tailscale usage
- Authentication flows removed from runtime requirements

## Consequences

- Simpler local deployment and backup portability
- Faster iteration on data model changes
- Single-payload strategy eases migration and snapshot import/export
- Requires careful import determinism for financial transaction semantics
