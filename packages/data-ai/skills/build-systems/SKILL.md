---
name: build-systems
description: Build a real-time feature's ecs/systems layer — the per-frame tick loop. Optional.
input: feature
output: feature
---

Skip unless the feature is real-time (games, simulations).

Create `ecs/systems/system-database.ts`: `Database.Plugin.create({ extends:
Database.Plugin.combine(<currentTop>.plugin, scheduler), systems: { … } })`, with the
`systems` map declared **inline** so `db` and the system names are inferred. Hot
per-row work writes columns in place; discrete events dispatch transactions. Order
systems under `schedule` to mirror the spec `step`.

Conform `step` with `frame: { op: "step", setup }` on the implementation. Gate: the
frame conformance passes, plus selection/detection tests.

The how is in the auto-loading `features/ecs/systems.md` rule.
