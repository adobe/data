// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "../../spec/state.js";
import type * as systems from "../../spec/systems.js";
import { board, riverLanes } from "../../spec/case-boards.js";

// Whole frames: `movement` then `collision`, in the order their `schedule`s declare.
// The hit, drown-past-edge and goal cases only hold in that order. dt = 1 so
// displacements are exact.
export const cases: Conformance.FrameCases<State, typeof systems> = {
  cases: [
    { name: "a car scrolling onto the frog costs a life and respawns it",
      before: board({ frog: { x: 1, y: 1 },
        entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }]]),
        frog: { x: 2, y: 0 }, lives: 2 } },
    { name: "a car scrolling onto the frog on the last life ends the game",
      before: board({ frog: { x: 1, y: 1 }, lives: 1,
        entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }]]),
        frog: { x: 1, y: 1 }, lives: 0, status: "gameOver" } },
    { name: "a log carries the frog along and keeps it safe",
      before: board({ lanes: riverLanes, frog: { x: 1, y: 1 },
        entities: new Map([[1, { kind: "log", lane: 1, x: 0, width: 3, velocity: 1 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "log", lane: 1, x: 1, width: 3, velocity: 1 }]]),
        frog: { x: 2, y: 1 }, lives: 3 } },
    { name: "a log carrying the frog past the edge drowns it",
      before: board({ lanes: riverLanes, frog: { x: 4, y: 1 },
        entities: new Map([[1, { kind: "log", lane: 1, x: 3, width: 2, velocity: 2 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "log", lane: 1, x: 0, width: 2, velocity: 2 }]]),
        frog: { x: 2, y: 0 }, lives: 2 } },
    { name: "reaching the goal scores and wins while hazards scroll",
      before: board({ frog: { x: 2, y: 2 },
        entities: new Map([[1, { kind: "car", lane: 1, x: 0, width: 1, velocity: 1 }]]) }),
      args: { dt: 1 },
      after: { entities: new Map([[1, { kind: "car", lane: 1, x: 1, width: 1, velocity: 1 }]]),
        score: 1, status: "won" } },
  ],
};
