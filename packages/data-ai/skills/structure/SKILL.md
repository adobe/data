---
name: structure
description: Use when laying out or reasoning about a feature's file/folder structure and layer dependencies.
---

A feature is a `features/<name>/` folder (features may nest) with four layers,
higher importing lower, never the reverse:

    ui → ecs → services → data

- `data/` — data-type namespaces (schema + type + pure helpers) and the
  `data/state/` spec. Depends on nothing but `@adobe/data` and other `data/`.
- `services/` — async capability contracts (ports to the outside world). Optional.
- `ecs/` — the schema (`core-database/`) plus the behavioural layers
  (`index → transaction → computed → service → action` databases), each a plugin
  extending the previous.
- `ui/` — presentation.

A feature creates only the layers it uses. An application is many features; one
base (`features/main/`) hosts peers that load lazily.

`features/index.md` is the full overview (layering + the spec/implementation
relationship), and each folder's rule covers how to author it. Worked examples:
the `data-lit-todo` and `data-lit-tictactoe` samples.
