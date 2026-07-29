---
name: build-data
description: Build a feature's data/ layer — data-type namespaces and the State spec. The first, foundational feature phase.
input: feature
output: feature
---

Create the feature's `data/` layer (pure spec; depends on nothing but `@adobe/data`
and other `data/` declarations):

- one namespace folder per data type — `<type>/{<type>.ts, schema.ts, public.ts, <helper>.ts}`;
- `data/state/` — the `State` aggregate plus its pure transforms/derivations.

**Always create `data/state/`** — even for a shell feature whose only field is a
boolean or enum. A feature with ECS resources/transactions but no `State` is
incomplete: the transaction must wrap a pure transform, not invent the logic. In rare circumstances, there may be no real state in a feature in which case the state type = {}

The schema is the single source of truth; the type derives from it (`Schema.ToType`).
Helpers are pure and unit-tested. Run this first — every other layer imports `data/`.

The how is in the auto-loading rules: `features/data/index.md`, `features/data/state.md`, and
`global/namespace.md`.
