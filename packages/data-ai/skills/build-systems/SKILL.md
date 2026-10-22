---
name: build-systems
description: Build a real-time feature's ecs/systems layer — the per-frame tick loop. Optional.
input: feature
output: feature
---

Legacy feature (has `data/state/` or `services/main-service/`)? Extend it in place per the legacy rules; don't migrate unless asked.

Skip unless the feature is real-time (games, simulations).

Create `ecs/systems/system-database.ts`: `Database.Plugin.create({ extends:
Database.Plugin.combine(<currentTop>.plugin, scheduler), systems: { … } })`, with the
`systems` map declared **inline** so `db` and the system names are inferred. Hot
per-row work writes columns in place; discrete events dispatch transactions. Order
systems under `schedule`; it is the only statement of order.

Add `frame: { args, unmodelled?, cases? }` to the implementation: a writer per frame
arg, each system the spec can't model (wasm, init-only) with its reason, and
whole-frame cases in `ecs/conformance/frame.cases.ts`. Gate: every
system's own cases and the frame cases pass.

The how is in the auto-loading `features/ecs/systems.md` rule.
