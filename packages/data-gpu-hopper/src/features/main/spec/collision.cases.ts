// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { Hazard } from "../data/entities/hazard.js";
import type { collision } from "./collision.js";
import { board, riverLanes } from "./case-boards.js";

const car: Hazard = { kind: "car", lane: 1, x: 2, width: 1, velocity: 0 };
const log: Hazard = { kind: "log", lane: 1, x: 0, width: 3, velocity: 0 };

// Outcome selection where the frog stands (collision runs alone, nothing moves).
// `after` is the writes patch.
export const cases: Conformance.SpecCases<State, typeof collision> = {
  cases: [
    { name: "a car under the frog costs a life and respawns it",
      before: board({ frog: { x: 2, y: 1 }, entities: new Map([[1, car]]) }),
      after: { lives: 2, frog: { x: 2, y: 0 }, status: "playing" } },
    { name: "a car on the frog's lane but not under it is safe",
      before: board({ frog: { x: 2, y: 1 }, entities: new Map([[1, { ...car, x: 0 }]]) }),
      after: { lives: 3, frog: { x: 2, y: 1 } } },
    { name: "the final life turns a hit into game over (no respawn)",
      before: board({ frog: { x: 2, y: 1 }, entities: new Map([[1, car]]), lives: 1 }),
      after: { lives: 0, status: "gameOver", frog: { x: 2, y: 1 } } },
    { name: "a log under the frog is safe (ride)",
      before: board({ lanes: riverLanes, frog: { x: 2, y: 1 }, entities: new Map([[1, log]]) }),
      after: { lives: 3, frog: { x: 2, y: 1 } } },
    { name: "open water with no log drowns the frog",
      before: board({ lanes: riverLanes, frog: { x: 2, y: 1 } }),
      after: { lives: 2, frog: { x: 2, y: 0 } } },
    // The log covers [0, 3); x = 3 is not covered.
    { name: "the log's exclusive right edge is open water (drown at the boundary)",
      before: board({ lanes: riverLanes, frog: { x: 3, y: 1 }, entities: new Map([[1, log]]) }),
      after: { lives: 2, frog: { x: 2, y: 0 } } },
    { name: "a frog off the board edge drowns even while over a log",
      before: board({ lanes: riverLanes, frog: { x: 5.2, y: 1 }, entities: new Map([[1, { ...log, x: 4 }]]) }),
      after: { lives: 2, frog: { x: 2, y: 0 } } },
    { name: "reaching the goal scores and wins",
      before: board({ frog: { x: 2, y: 2 } }),
      after: { score: 1, status: "won" } },
    { name: "grass is always safe",
      before: board({ frog: { x: 2, y: 0 } }),
      after: { lives: 3, score: 0, status: "playing" } },
  ],
};
