// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";

import { cases as playMove } from "./play-move.cases.js";
import { cases as restartGame } from "./restart-game.cases.js";
import { cases as board } from "./board.cases.js";
import { cases as currentPlayer } from "./current-player.cases.js";

// The feature's spec: every action and derivation, one cases module each. No entity
// references and no injected services, so neither `schemas` nor `services` is needed.
// `ecs/conformance/` pairs it with the ECS build.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  cases: { playMove, restartGame, board, currentPlayer },
});
