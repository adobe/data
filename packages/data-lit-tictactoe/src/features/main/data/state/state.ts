// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { BoardState } from "../board-state/board-state.js";
import type { PlayerMark } from "../player-mark/player-mark.js";
import type { Score } from "../score/score.js";

// The full persistent game state as one immutable object — the specification
// the ECS implementation is verified against.
export type State = {
  readonly board: BoardState;
  readonly firstPlayer: PlayerMark;
  readonly xWins: Score;
  readonly oWins: Score;
  readonly draws: Score;
};
export * as State from "./public.js";
