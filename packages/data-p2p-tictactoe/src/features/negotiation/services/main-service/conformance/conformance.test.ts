// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { Conformance } from "@adobe/data/testing";
import { State } from "../../../data/state/state.js";
import { MainService } from "../main-service.js";
import { projection } from "./projection.js";

// The whole ecs conformance for this feature in one call: `runFeature` pulls the
// transactions off `MainService.plugin`, seeds each case's `before` (a delta) over
// `State.create()`, and round-trips `State.samples` through the projection.
// Negotiation's per-transition actions (set-offer-code, enter-game, …) are
// deliberately kept out of the plugin's `actions` facet (that would grow the plugin
// type past tsc's budget), so they are discovered via the actions-directory glob
// (`ops.actions`) instead of off `plugin.actions`. Transactions ARE registered, so
// no transactions override; there are no derivations, so no `computedPlugin`.
Conformance.runFeature({
  state: State,
  transitions: import.meta.glob(
    ["../../../data/state/*.ts", "!**/*.test.ts", "!**/*.type-test.ts"],
    { eager: true },
  ),
  plugin: MainService.plugin,
  projection,
  ops: {
    actions: import.meta.glob(
      ["../action-database/actions/*.ts", "!**/index.ts"],
      { eager: true },
    ),
  },
});
