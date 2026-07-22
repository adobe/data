---
name: build-app-entry
description: Wire built features into a running application — import peer schemas, lazy-load peers, and mount the root UI.
input: app
output: app
---

- The base (`features/main`) core-database `imports` each peer feature's core-database
  plugin, so all schemas coexist, persist, and sync while the base type stays decoupled.
- The base reaches a peer only through a lazy element wrapper (dynamic import), so peers
  load on demand.
- The entry point creates the live database from the base plugin and mounts the root UI.

See `features/index.md` (one-app-many-features) for the wiring rules.
