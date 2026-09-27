// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { MainService } from "../../services/main-service/main-service.js";
import { ComputedDatabase } from "../../services/main-service/computed-database/computed-database.js";
import { projection } from "../../services/main-service/conformance/projection.js";

import { cases as playMove } from "./play-move.cases.js";
import { cases as restartGame } from "./restart-game.cases.js";
import { cases as currentPlayer } from "./current-player.cases.js";

// The feature's conformance manifest — the single object `spec.test.ts` (pure) and
// `conformance.test.ts` (ecs) both import. It wires each conformed fn to its inert cases module explicitly: `cases` names one module per conformed fn,
// checked at COMPILE TIME against `transforms` (a fn without cases, or cases without
// a fn, won't type). `computedPlugin` is required because `currentPlayer` is a
// derivation. This feature injects no capability services, so `services` is omitted;
// tictactoe is index-addressed (no entity-id-list derivation), so no `hydrate`.
//
// This is a test-tier module (excluded from the runtime program) — the ONE place the
// feature touches `@adobe/data-testing`. No transform or `*.cases.ts` file does.
export const spec = Conformance.feature({
  state: State,
  fns: transforms,
  plugin: MainService.plugin,
  computedPlugin: ComputedDatabase.plugin,
  projection,
  cases: {
    playMove,
    restartGame,
    currentPlayer,
  },
});
