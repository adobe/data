---
name: build-systems
description: Build a feature's system-database — the real-time tick loop (systems the scheduler runs each frame). For real-time features only.
input: feature
output: feature
---

Skip if this feature doesn't contain or require systems.
Most games that use a canvas will use systems but most applications will not.

Create `services/main-service/system-database/system-database.ts`: `Database.Plugin.create({ extends:
Database.Plugin.combine(ComputedDatabase.plugin, scheduler), systems })` where the `systems`
map is declared **inline** (see `features/services/main-service/systems.md` — inline is required for `db` to be
typed and for system-name inference; a `systems/` folder is optional, only for extracted
per-frame body helpers).

- A system is a `SystemDeclaration`: `{ create, schedule?: { before?, after?, during? } }`.
  `create(db)` runs once (capture queries / index handles / closures); the returned function
  advances the world one tick. Return `void` for an init-only system (seeding entities).
- Order under `schedule` (mirror the `data/` step's internal sequence); drive the loop by
  combining `scheduler` (rAF), gated by the `schedulerState` resource.

**Only for real-time features** (games, sims) — turn-based features skip this phase entirely.
Comes after `build-computed`. The how is in the auto-loading `features/services/main-service/systems.md` rule.
