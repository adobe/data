---
name: structure
description: Use when scaffolding or laying out a feature — file/folder layout, layers, and build order.
---

Lay out feature code **bottom-up** so each layer imports the one below
(`ui → ecs → services → data`). Every source file lives inside a
`features/<name>/` folder (features may nest); build only the layer(s) asked for.

1. `data/` — data-type namespaces (schema + type + pure helpers) and the
   `data/state/` spec.
2. `services/` — async capability contracts (optional).
3. `ecs/` — the schema (`core-database/`), then the behavioural layers
   (`index → transaction → computed → service → action`), created only as needed.
4. `ui/` — presentation.

The **how** for each layer is not restated here — the `features/` rule tree is
the source of truth and **auto-loads by path as you create each file** (editing
`…/ecs/core-database/components.ts` pulls in the components rule, and so on).
Start from `features/index.md` for the layering and the spec/implementation
relationship, then follow each folder's rule as you author it.

Worked examples: the `data-lit-todo` and `data-lit-tictactoe` sample features.
