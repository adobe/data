---
name: build-data
description: Build a feature's data/ layer — data-type namespaces and the State spec. The first, foundational feature phase.
---

Create the feature's `data/` layer (pure spec; depends on nothing but `@adobe/data`
and other `data/` declarations):

- one namespace folder per data type — `<type>/{<type>.ts, schema.ts, public.ts, <helper>.ts}`;
- `data/state/` — the `State` aggregate plus its pure transforms/derivations.

The schema is the single source of truth; the type derives from it (`Schema.ToType`).
Helpers are pure and unit-tested. Run this first — every other layer imports `data/`.

The how is in the auto-loading rules: `features/data/index.md`, `data/state.md`, and
`namespace.md`.
