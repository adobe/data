// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "@adobe/data/observe";
import { board } from "../../computed-database/computed/board.js";
import type { ServiceDatabase } from "../../service-database/service-database.js";

// The app-facing realization of `State.playOpponentMove`: read the current board,
// await the opponent port's selected index (the async outside-world work), then
// commit exactly one placement through `playMove`. `selectMove` is a
// value-returning read, not a fire-and-forget effect. Fire-and-forget: the
// selected index flows back through the transaction's observables, not a return.
export const playOpponentMove = async (db: ServiceDatabase) => {
  const currentBoard = await Observe.toPromise(board(db));
  const index = await db.services.opponent.selectMove(currentBoard);
  db.transactions.playMove({ index });
};
