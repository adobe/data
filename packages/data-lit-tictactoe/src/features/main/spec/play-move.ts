// © 2026 Adobe. MIT License. See /LICENSE for details.
import { PlayMoveArgs } from "../data/values/play-move-args/play-move-args.js";
import type { State } from "./state.js";
import { currentPlayer } from "./current-player.js";
import { board } from "./board.js";

// Place the current player's mark into cell `index` — a `{ marks }` patch that mints
// the next id. An illegal move (out of bounds, occupied, game over) changes nothing.
export const playMove = (
  state: Pick<State, "marks" | "firstPlayer">,
  { index }: PlayMoveArgs,
): Pick<State, "marks"> => {
  if (!PlayMoveArgs.canPlayMove({ board: board(state), index }).ok) return { marks: state.marks };
  const id = Math.max(0, ...state.marks.keys()) + 1;
  return {
    marks: new Map(state.marks).set(id, { mark: currentPlayer(state), cellIndex: index }),
  };
};
