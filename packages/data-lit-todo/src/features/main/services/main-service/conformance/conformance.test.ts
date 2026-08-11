// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "../../../data/state/state.js";
import { transitions } from "../../../data/state/transitions.js";
import { MainService } from "../main-service.js";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import { projection } from "./projection.js";

// The whole ecs conformance for this feature in one call: `runFeature` pulls the
// transactions/actions off `MainService.plugin`, the computeds off the
// `ComputedDatabase` layer, seeds each case's `before` (a delta) over
// `State.create()`, and round-trips `State.samples` through the projection.
// `transitions` (the discovered `{ fn, cases }` modules) is shared with spec.test.
// `visibleTodos` emits entity ids, so it is named in `hydrate` to project each
// through `toData` into the `Todo[]` the derivation yields.
Conformance.runFeature({
  state: State,
  transitions,
  plugin: MainService.plugin,
  computedPlugin: ComputedDatabase.plugin,
  projection,
  hydrate: ["visibleTodos"],
});
