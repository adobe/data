// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { spec } from "../../../data/state/spec.js";

// The whole ecs conformance for this feature in one call: `checkFeature` pairs each
// transaction/action on `MainService.plugin` with its same-named `data/state`
// transition (`createInitial` transaction, `fireBullet` transaction + action,
// `spawnRandomWave` action), seeds each case's `before` over `State.create()`, and
// round-trips `State.samples` through the `projection`. The bullets and asteroids live
// in one identity-keyed `entities` `ReadonlyMap`, so the comparator matches them
// order-independently (the ecs materialises them in nondeterministic row order and
// mints its own ids the `after`/`samples` refs leave open). The per-frame transitions
// (`step*`, `resolve*`, `spawnWave`) have no same-named ecs op — the system tick loop
// conforms them in `system-database/tick-loop.test.ts` (see systems.md) — so they are
// simply skipped here. Space-rock has no derivations, so no `computedPlugin`.
Conformance.checkFeature(spec);
