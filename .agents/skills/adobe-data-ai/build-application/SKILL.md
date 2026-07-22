---
name: build-application
description: Build an application — a base feature hosting lazily-loaded peer features. Composes build-feature.
---

An application is a set of features under `features/`, one base (`features/main/`)
hosting the rest:

1. `build-feature` for `features/main/` — the base.
2. `build-feature` for each additional capability — as a peer feature.
3. **Wire peers into the base:** main's `core-database` `imports` each peer's
   `core-database` plugin (schema coexists / persists / syncs, base type stays
   decoupled); the base reaches a peer only through a lazy element wrapper that
   dynamically imports the peer's UI, so peers load on demand.
4. **Entry:** create the live database from the base plugin and mount the root UI.

See `features/index.md` (one-app-many-features) for the wiring rules.
