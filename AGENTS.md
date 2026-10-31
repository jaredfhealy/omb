# OMB Agent & Contributor Operating Guide

This file is the canonical, tool-agnostic workflow and behavior guide for AI agents and human contributors working in this repository.

If a tool supports repository instructions, point it to this file first.

## Source of truth docs

Read these before implementing changes:

- [README.md](./README.md)
- [docs/spec/README.md](./docs/spec/README.md)
- [docs/adr/README.md](./docs/adr/README.md)
- [docs/spec/data-model-v2.md](./docs/spec/data-model-v2.md)
- [docs/spec/v2-implementation-status.md](./docs/spec/v2-implementation-status.md)

## Core engineering rules

1. Make surgical, complete changes for the requested scope.
2. Preserve existing behavior unless a behavior change is explicitly required.
3. Favor root-cause fixes over workarounds.
4. Reuse existing patterns/helpers before introducing new ones.
5. Keep data-model and persistence changes consistent across:
   - transform to persisted collections
   - transform back to app state
   - integrity validation
   - docs/spec updates

## Validation expectations

- Run targeted validation after meaningful code changes.
- Prefer the smallest command that validates the modified surface.
- For documentation-only changes, no build/test run is required unless docs tooling depends on it.

## Commit gate and pre-commit checklist

Never create a commit until the user explicitly confirms they want a commit for the current staged changes.

Before requesting commit confirmation, complete this checklist:

1. Run scoped validation for the changed surfaces and confirm pass/fail clearly.
2. Update directly related docs/spec files in the same change when behavior or architecture changed.
3. Re-check [docs/spec/v2-implementation-status.md](./docs/spec/v2-implementation-status.md) and mark completed items when they are verifiably done.
4. Review repository root for temporary scratch artifacts (scripts, screenshots, ad-hoc test files) and move/remove them.
5. Summarize:
   - what changed
   - what validation ran
   - any open risks/questions

After the checklist is complete, ask the user for explicit commit approval and proposed commit message.

## Local test-data workflow

Use [local-data/](./local-data/) for manual test artifacts:

- brokerage transaction CSV exports
- positions CSV exports
- backup JSON files

Rules:

- [local-data/.gitignore](./local-data/.gitignore) must remain tracked.
- Files placed inside [local-data/](./local-data/) must remain untracked.
- Never commit sensitive account exports or backup payloads.
- Keep temporary debug/scratch artifacts out of repository root. Place local-only helpers in [local-data/](./local-data/) (for example `local-data/dev-tools/` or `local-data/screenshots/`) and keep them untracked.

## Import/destructive testing safety

Before destructive test actions (for example “delete all before import”):

1. Ensure a current backup exists (or export one).
2. Keep latest CSV inputs in [local-data/](./local-data/) for reruns.
3. Verify expected preservation behavior after import (for example notes and checkpoints that should persist).

## Tool-specific instruction files

Tool-specific files (for example Copilot-specific instructions) should reference this file rather than duplicating large, independent policy text.
