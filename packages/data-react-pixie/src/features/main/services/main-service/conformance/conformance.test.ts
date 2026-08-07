// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";
import { State } from "../../../data/state/state.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";

// The whole ecs conformance for this feature in one call: `runFeature` pulls the
// transactions/actions off `MainService.plugin`, seeds each case's `before` (a
// delta) over `State.create()`, resolves each entity-addressed case's `entity()`
// markers through the `fromState` id map, and round-trips `State.samples` through
// the projection. This feature has no derivations, so no `computedPlugin`.
Conformance.runFeature({
  state: State,
  transitions: import.meta.glob(
    ["../../../data/state/*.ts", "!**/*.test.ts", "!**/*.type-test.ts"],
    { eager: true },
  ),
  plugin: MainService.plugin,
  projection,
});
