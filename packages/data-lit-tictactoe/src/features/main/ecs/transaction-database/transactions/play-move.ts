// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../../../data/board-state/board-state.js";
import { PlayMoveArgs } from "../../../data/play-move-args/play-move-args.js";
import type { ArchetypeDatabase } from "../../archetype-database/archetype-database.js";
import { readBoard } from "./read-board.js";

/**
 * Play the current player's mark into `index` by creating a PlacedMark entity.
 * In sync/P2P mode (`t.userId` set) a peer may only play their own mark;
 * illegal or out-of-turn moves are silently ignored so the transaction stays
 * idempotent under replay.
 */
export const playMove = (t: ArchetypeDatabase.Store, { index }: PlayMoveArgs) => {
  const board = readBoard(t);
  const mark = BoardState.currentPlayer(board, t.resources.firstPlayer);
  if (t.userId !== undefined && t.userId !== mark) return;
  if (!PlayMoveArgs.canPlayMove({ board, index }).ok) return;
  t.archetypes.PlacedMark.insert({ mark, index });
};
