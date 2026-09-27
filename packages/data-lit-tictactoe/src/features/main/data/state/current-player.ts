// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../board-state/board-state.js";
import type { PlayerMark } from "../player-mark/player-mark.js";
import type { State } from "./state.js";

// Whose turn it is: composes TWO `State` fields — the board (move count) and the
// `firstPlayer` — so it is a `state/` derivation, not single-field board math
// (see `data/state.md`). The mark-counting itself is the board's own helper
// (`BoardState.currentPlayer`), which the ecs implementation reuses directly; this
// derivation is the spec the ecs `currentPlayer` computed is conformed against.
export const currentPlayer = (
  state: Pick<State, "board" | "firstPlayer">,
): PlayerMark => BoardState.currentPlayer(state.board, state.firstPlayer);
