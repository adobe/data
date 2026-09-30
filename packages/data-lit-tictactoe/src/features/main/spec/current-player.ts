// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../data/values/board-state/board-state.js";
import type { PlayerMark } from "../data/values/player-mark/player-mark.js";
import type { State } from "./state.js";
import { board } from "./board.js";

// Whose turn it is: the first player when both have moved equally, else the opponent.
export const currentPlayer = (state: Pick<State, "marks" | "firstPlayer">): PlayerMark =>
  BoardState.currentPlayer(board(state), state.firstPlayer);
