// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { movement } from "./movement.js";
import { board, riverLanes } from "./case-boards.js";

// dt = 1 so displacements are exact. `after` is the writes patch (`entities`, `frog`).
export const cases: Conformance.SpecCases<State, typeof movement> = {
  cases: [
    { name: "scrolls hazards and leaves a frog on grass in place",
      before: board({ entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }]]), frog: { x: 2, y: 0 } } },
    { name: "a car does not carry the frog",
      before: board({ frog: { x: 0, y: 1 },
        entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }]]), frog: { x: 0, y: 1 } } },
    { name: "a log carries the frog by its velocity",
      before: board({ lanes: riverLanes, frog: { x: 1, y: 1 },
        entities: new Map([[1, { kind: "log", lane: 1, x: 0, width: 3, velocity: 1 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "log", lane: 1, x: 1, width: 3, velocity: 1 }]]), frog: { x: 2, y: 1 } } },
    // Pre-scroll the log [3, 5) covers x = 4; post-scroll it wraps to [0, 2), which
    // does not. The carrier comes from the pre-scroll positions.
    { name: "finds the carrier from the pre-scroll positions",
      before: board({ lanes: riverLanes, frog: { x: 4, y: 1 },
        entities: new Map([[1, { kind: "log", lane: 1, x: 3, width: 2, velocity: 2 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "log", lane: 1, x: 0, width: 2, velocity: 2 }]]), frog: { x: 6, y: 1 } } },
    { name: "a frog in the water beside a log is not carried",
      before: board({ lanes: riverLanes, frog: { x: 4, y: 1 },
        entities: new Map([[1, { kind: "log", lane: 1, x: 0, width: 3, velocity: 1 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "log", lane: 1, x: 1, width: 3, velocity: 1 }]]), frog: { x: 4, y: 1 } } },
    { name: "is frozen once the game is over",
      before: board({ status: "gameOver", lives: 0,
        entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]), frog: { x: 2, y: 0 } } },
  ],
};
