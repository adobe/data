// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity). Varied boards + non-default counters exercise the whole ecs↔State map.
export const samples: readonly State[] = [
  { board: "XOXXOOOXX", firstPlayer: "O", xWins: 3, oWins: 2, draws: 1 },
  { board: "X O X    ", firstPlayer: "O", xWins: 1, oWins: 0, draws: 0 },
];
