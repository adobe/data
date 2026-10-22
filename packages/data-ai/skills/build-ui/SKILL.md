---
name: build-ui
description: Build a feature's ui/ layer.
input: feature
output: feature
---

Legacy feature (has `data/state/` or `services/main-service/`)? Extend it in place per the legacy rules; don't migrate unless asked.

Create `ui/`: one folder per UI unit —
`<name>/{<name>.ts (lazy wrapper), <name>-element.ts (container), <name>-presentation.ts (pure render), <name>.css.ts}`.
The element subscribes to `MainService` state and calls `service.actions.*`; the
presentation imports only `data/` and sibling `ui/` lazy wrappers. No business logic here.

Comes last. Gate: presentation tests. The how is in the auto-loading
`features/ui/index.md` rule (and `element.md`, `lazy-element.md`, `presentation.md`).
