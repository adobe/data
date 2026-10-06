---
name: build-app-entry
description: Build an application's src/app/ composition root.
input: app
output: app
---

A legacy feature (has `data/state/` or `services/main-service/`) exposes its `MainService` from `services/main-service/`; compose it from there.

Create `src/app/`:

- `schema.ts` — the composed plugin: the base feature's `MainService.plugin`, `imports`
  of the core schema of each feature that loads lazily (single-feature apps skip this).
- `versioning/` — `versions.ts` + `versions.test.ts` over the composed schema, when
  the app persists.
- `persistence.test.ts` — a save/load round-trip, when the app persists.
- `main.ts` — creates the database, injects every service whose `create` throws, and
  mounts the root UI. Point `index.html` at it.

The how is in the auto-loading `app.md` and `versioning.md` rules, and
`features/index.md` (one app, many features).
