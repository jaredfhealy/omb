# ADR 0002: Deterministic import execution sequencing

Status: Accepted  
Date: 2026-10-14

## Context

Schwab transaction exports may be newest-first and may include same-day rows where in-day order impacts lot matching outcomes (long/short open/close behavior).

Incorrect sequencing can produce invalid open positions after import.

## Decision

- Define and enforce effective execution ordering during import.
- Use `"as of"` trailing date when present as effective trade date.
- Normalize processing to oldest-first execution.
- Preserve same-day ordering from source (direction-aware for descending exports).
- Use internal execution sequence for lot matching and tie-breaks.

## Consequences

- Deterministic lot allocation behavior across re-import runs
- Correct handling of short open + buy cover flows
- Reduced risk of phantom open lots caused by ordering ambiguity
