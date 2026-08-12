// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "../../../data/state/state.js";
import { transitions } from "../../../data/state/transitions.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";

// The whole ecs conformance for this feature in one call: `runFeature` pulls the
// transactions/actions off `MainService.plugin`, seeds each case's `before` (a
// delta) over `State.create()`, and round-trips `State.samples` through the
// projection. `transitions` (the discovered `{ fn, cases }` modules) is shared with
// spec.test. The entity bags the ecs materialises in nondeterministic row order
// (`bullets`, `asteroids`) are typed `ReadonlySet`, so the comparator matches them
// order-independently. There is no `computedPlugin` — space-rock has no `state/`
// derivations.
Conformance.runFeature({
  state: State,
  transitions,
  plugin: MainService.plugin,
  projection,
});
