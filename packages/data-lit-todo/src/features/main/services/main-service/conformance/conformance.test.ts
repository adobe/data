// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";
import { State } from "../../../data/state/state.js";
import { MainService } from "../main-service.js";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import { projection } from "./projection.js";

// The whole ecs conformance for this feature in one call: `runFeature` pulls the
// transactions/actions off `MainService.plugin`, the computeds off the
// `ComputedDatabase` layer, seeds each case's `before` (a delta) over
// `State.create()`, and round-trips `State.samples` through the projection.
// `visibleTodos` emits entity ids, so it is named in `hydrate` to project each
// through `toData` into the `Todo[]` the derivation yields.
Conformance.runFeature({
  state: State,
  transitions: import.meta.glob(
    ["../../../data/state/*.ts", "!**/*.test.ts", "!**/*.type-test.ts"],
    { eager: true },
  ),
  plugin: MainService.plugin,
  computedPlugin: ComputedDatabase.plugin,
  projection,
  hydrate: ["visibleTodos"],
});
