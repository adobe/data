// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Direction } from "../direction/direction.js";
import type { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";

// A bare 5-wide, 3-tall board. `hop` reads only frog / width / height / status,
// so the lanes and hazards are irrelevant and left empty here.
const base: Omit<State, "frog"> = {
  width: 5,
  height: 3,
  lanes: [],
  hazards: [],
  lives: 3,
  score: 0,
  status: "playing",
};

// Spec-owned `{ before, args, after }` cases for `State.hop`, shared with the ecs
// hop transaction. Covers each direction, clamping at all four board edges, the
// grid-snap of a log-ridden fractional x, and the game-over no-op.
export const cases: readonly ConformanceCase<Direction>[] = [
  {
    name: "hops up toward the goal",
    before: { ...base, frog: { x: 2, y: 0 } },
    args: "up",
    after: { ...base, frog: { x: 2, y: 1 } },
  },
  {
    name: "hops down toward the start",
    before: { ...base, frog: { x: 2, y: 1 } },
    args: "down",
    after: { ...base, frog: { x: 2, y: 0 } },
  },
  {
    name: "hops left",
    before: { ...base, frog: { x: 2, y: 1 } },
    args: "left",
    after: { ...base, frog: { x: 1, y: 1 } },
  },
  {
    name: "hops right",
    before: { ...base, frog: { x: 2, y: 1 } },
    args: "right",
    after: { ...base, frog: { x: 3, y: 1 } },
  },
  {
    name: "clamps at the bottom row",
    before: { ...base, frog: { x: 2, y: 0 } },
    args: "down",
    after: { ...base, frog: { x: 2, y: 0 } },
  },
  {
    name: "clamps at the top (goal) row",
    before: { ...base, frog: { x: 2, y: 2 } },
    args: "up",
    after: { ...base, frog: { x: 2, y: 2 } },
  },
  {
    name: "clamps at the left edge",
    before: { ...base, frog: { x: 0, y: 1 } },
    args: "left",
    after: { ...base, frog: { x: 0, y: 1 } },
  },
  {
    name: "clamps at the right edge",
    before: { ...base, frog: { x: 4, y: 1 } },
    args: "right",
    after: { ...base, frog: { x: 4, y: 1 } },
  },
  {
    name: "snaps a log-ridden fractional x while hopping sideways",
    before: { ...base, frog: { x: 2.4, y: 1 } },
    args: "right",
    after: { ...base, frog: { x: 3, y: 1 } },
  },
  {
    name: "snaps a log-ridden fractional x while hopping forward",
    before: { ...base, frog: { x: 2.6, y: 1 } },
    args: "up",
    after: { ...base, frog: { x: 3, y: 2 } },
  },
  {
    name: "ignores input once the game is over",
    before: { ...base, status: "gameOver", frog: { x: 2, y: 1 } },
    args: "up",
    after: { ...base, status: "gameOver", frog: { x: 2, y: 1 } },
  },
];
