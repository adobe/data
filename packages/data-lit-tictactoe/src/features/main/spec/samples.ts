// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { marksOf } from "./marks-of.js";

// Representative full states for the projection round-trip (toState ∘ fromState ≡
// identity): a full drawn board and a game in progress, with non-default counters.
export const samples: readonly State[] = [
  { marks: marksOf("XOXXOOOXX"), firstPlayer: "O", xWins: 3, oWins: 2, draws: 1 },
  { marks: marksOf("X O X    "), firstPlayer: "O", xWins: 1, oWins: 0, draws: 0 },
];
