// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { hop } from "./hop.js";

// A bare 5-wide, 3-tall board. `hop` reads only frog / width / height / status,
// so the lanes and hazards are irrelevant and left empty here.
const base: Omit<State, "frog"> = {
  boardWidth: 5,
  boardHeight: 3,
  lanes: [],
  entities: new Map(),
  lives: 3,
  score: 0,
  status: "playing",
};

// `before` overrides the default with a small test board; `after` is the writes patch
// (`frog` only).
export const cases: Conformance.SpecCases<State, typeof hop> = {
  cases: [
    { name: "hops up toward the goal",
      before: { ...base, frog: { x: 2, y: 0 } }, args: { direction: "up" }, after: { frog: { x: 2, y: 1 } } },
    { name: "hops down toward the start",
      before: { ...base, frog: { x: 2, y: 1 } }, args: { direction: "down" }, after: { frog: { x: 2, y: 0 } } },
    { name: "hops left",
      before: { ...base, frog: { x: 2, y: 1 } }, args: { direction: "left" }, after: { frog: { x: 1, y: 1 } } },
    { name: "hops right",
      before: { ...base, frog: { x: 2, y: 1 } }, args: { direction: "right" }, after: { frog: { x: 3, y: 1 } } },
    { name: "clamps at the bottom row",
      before: { ...base, frog: { x: 2, y: 0 } }, args: { direction: "down" }, after: { frog: { x: 2, y: 0 } } },
    { name: "clamps at the top (goal) row",
      before: { ...base, frog: { x: 2, y: 2 } }, args: { direction: "up" }, after: { frog: { x: 2, y: 2 } } },
    { name: "clamps at the left edge",
      before: { ...base, frog: { x: 0, y: 1 } }, args: { direction: "left" }, after: { frog: { x: 0, y: 1 } } },
    { name: "clamps at the right edge",
      before: { ...base, frog: { x: 4, y: 1 } }, args: { direction: "right" }, after: { frog: { x: 4, y: 1 } } },
    { name: "snaps a log-ridden fractional x while hopping sideways",
      before: { ...base, frog: { x: 2.4, y: 1 } }, args: { direction: "right" }, after: { frog: { x: 3, y: 1 } } },
    { name: "snaps a log-ridden fractional x while hopping forward",
      before: { ...base, frog: { x: 2.6, y: 1 } }, args: { direction: "up" }, after: { frog: { x: 3, y: 2 } } },
    { name: "ignores input once the game is over",
      before: { ...base, status: "gameOver", frog: { x: 2, y: 1 } }, args: { direction: "up" },
      after: { frog: { x: 2, y: 1 } } },
  ],
};
