// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { winGoal } from "./win-goal.js";

// winGoal reads only score / status; the rest is inert here.
const base: Omit<State, "score" | "status"> = {
  width: 5,
  height: 3,
  lanes: [],
  entities: new Map(),
  lives: 3,
  frog: { x: 2, y: 2 },
};

// Inert, spec-owned cases, shared with the ecs `winGoal` transaction. No args and
// no services — a bare read→write patch over score / status.
export const cases: Conformance.SpecCases<State, typeof winGoal> = {
  cases: [
    { name: "scores the goal and wins",
      before: { ...base, score: 2, status: "playing" }, after: { score: 3, status: "won" } },
    { name: "ignores a finished game (no-op)",
      before: { ...base, score: 3, status: "won" }, after: { score: 3, status: "won" } },
  ],
};
