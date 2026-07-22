---
name: build-ui
description: Build a feature's ui/ layer — presentation bound to the ecs database. The final, top layer.
---

Create `ui/`: one folder per UI unit —
`<name>/{<name>.ts (lazy wrapper), <name>-element.ts (container), <name>-presentation.ts (pure render), <name>.css.ts}`.
The element subscribes to state and delegates to the pure presentation; no business logic here.

Comes last. The how is in the auto-loading `features/ui/index.md` rule (and `element.md`,
`lazy-element.md`, `presentation.md`).
