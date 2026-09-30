// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import * as systems from "./systems.js";

import { cases as hop } from "./hop.cases.js";
import { cases as newGame } from "./new-game.cases.js";
import { cases as movement } from "./movement.cases.js";
import { cases as collision } from "./collision.cases.js";
import { board } from "./case-boards.js";

// The feature's spec: the `hop` / `newGame` actions and the `movement` / `collision`
// systems, each with its cases, plus the game-over state both systems leave unchanged.
// No entity references and no injected services, so no `schemas` or `services`.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  cases: { hop, newGame },
  systems: {
    fns: systems,
    cases: { movement, collision },
    noOp: [
      { name: "frozen once the game is over",
        before: board({ frog: { x: 2, y: 1 }, lives: 0, status: "gameOver",
          entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]) }),
        args: { dt: 1 } },
    ],
  },
});
