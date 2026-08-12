// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Direction } from "../direction/direction.js";
import { GameStatus } from "../game-status/game-status.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));

// Snap the frog one cell in `direction`, re-aligning a log-ridden fractional `x`
// back onto the grid and clamping to the board. A no-op unless the game is in
// play, keeping it idempotent. Writes only `frog`.
export const hop = (
  state: Pick<State, "frog" | "width" | "height" | "status">,
  direction: Direction,
): Pick<State, "frog"> => {
  if (!GameStatus.isPlaying(state.status)) return { frog: state.frog };
  const { dx, dy } = Direction.delta[direction];
  return {
    frog: {
      x: clamp(Math.round(state.frog.x) + dx, state.width - 1),
      y: clamp(state.frog.y + dy, state.height - 1),
    },
  };
};

// A bare 5-wide, 3-tall board. `hop` reads only frog / width / height / status,
// so the lanes and hazards are irrelevant and left empty here.
const base: Omit<State, "frog"> = {
  width: 5,
  height: 3,
  lanes: [],
  hazards: new Set(),
  lives: 3,
  score: 0,
  status: "playing",
};

// Spec-owned cases, shared with the ecs `hop` transaction. `before` overrides the
// default with a small test board; `after` is the writes patch (`frog` only).
export const cases: Conformance<typeof hop> = [
  { name: "hops up toward the goal",
    before: { ...base, frog: { x: 2, y: 0 } }, args: "up", after: { frog: { x: 2, y: 1 } } },
  { name: "hops down toward the start",
    before: { ...base, frog: { x: 2, y: 1 } }, args: "down", after: { frog: { x: 2, y: 0 } } },
  { name: "hops left",
    before: { ...base, frog: { x: 2, y: 1 } }, args: "left", after: { frog: { x: 1, y: 1 } } },
  { name: "hops right",
    before: { ...base, frog: { x: 2, y: 1 } }, args: "right", after: { frog: { x: 3, y: 1 } } },
  { name: "clamps at the bottom row",
    before: { ...base, frog: { x: 2, y: 0 } }, args: "down", after: { frog: { x: 2, y: 0 } } },
  { name: "clamps at the top (goal) row",
    before: { ...base, frog: { x: 2, y: 2 } }, args: "up", after: { frog: { x: 2, y: 2 } } },
  { name: "clamps at the left edge",
    before: { ...base, frog: { x: 0, y: 1 } }, args: "left", after: { frog: { x: 0, y: 1 } } },
  { name: "clamps at the right edge",
    before: { ...base, frog: { x: 4, y: 1 } }, args: "right", after: { frog: { x: 4, y: 1 } } },
  { name: "snaps a log-ridden fractional x while hopping sideways",
    before: { ...base, frog: { x: 2.4, y: 1 } }, args: "right", after: { frog: { x: 3, y: 1 } } },
  { name: "snaps a log-ridden fractional x while hopping forward",
    before: { ...base, frog: { x: 2.6, y: 1 } }, args: "up", after: { frog: { x: 3, y: 2 } } },
  { name: "ignores input once the game is over",
    before: { ...base, status: "gameOver", frog: { x: 2, y: 1 } }, args: "up",
    after: { frog: { x: 2, y: 1 } } },
];
