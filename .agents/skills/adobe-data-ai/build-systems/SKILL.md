---
name: build-systems
description: Build a feature's ecs system-database — the real-time tick loop (systems the scheduler runs each frame). For real-time features only.
input: feature
output: feature
---

Create `ecs/system-database/system-database.ts`: `Database.Plugin.create({ extends:
Database.Plugin.combine(ComputedDatabase.plugin, scheduler), systems })` where the `systems`
map is declared **inline** (see `features/ecs/systems.md` — inline is required for `db` to be
typed and for system-name inference; a `systems/` folder is optional, only for extracted
per-frame body helpers).

- A system is a `SystemDeclaration`: `{ create, schedule?: { before?, after?, during? } }`.
  `create(db)` runs once (capture queries / index handles / closures); the returned function
  advances the world one tick. Return `void` for an init-only system (seeding entities).
- The step math lives in `data/`; each system reads store rows, calls the pure `data/` step,
  writes back — via `db.store` (writable) for hot per-row work, or `db.transactions.*` for
  discrete events. Iterate archetypes per `archetypes.md` (tail→head when destroying rows).
- Order under `schedule` (mirror the `data/` step's internal sequence); drive the loop by
  combining `scheduler` (rAF), gated by the `schedulerState` resource.

**Only for real-time features** (games, sims) — turn-based features skip this phase entirely.
Comes after `build-computed`. The how is in the auto-loading `features/ecs/systems.md` rule.
