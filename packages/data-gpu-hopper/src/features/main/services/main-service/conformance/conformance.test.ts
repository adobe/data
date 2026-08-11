// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "../../../data/state/state.js";
import { transitions } from "../../../data/state/transitions.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";

// The whole ecs conformance for this feature in one call: `runFeature` pairs each
// transaction on `MainService.plugin` (hop / winGoal / loseLife / newGame) with its
// same-named `data/state` transition, seeds each case's `before` over
// `State.create()`, and round-trips `State.samples` through the projection. The
// hazard bag the ecs materialises in nondeterministic row order compares as a
// multiset via `match.unordered`. `step` has no transaction — the per-frame system
// loop conforms it in `system-database/tick-loop.test.ts` (see systems.md) — so it
// is simply skipped here. Hopper has no derivations, so no `computedPlugin`.
Conformance.runFeature({
  state: State,
  transitions,
  plugin: MainService.plugin,
  projection,
  match: { unordered: new Set(["hazards"]) },
});
