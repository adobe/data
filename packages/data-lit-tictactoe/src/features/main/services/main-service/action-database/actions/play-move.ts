// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { PlayMoveArgs } from "../../../../data/play-move-args/play-move-args.js";
import type { ServiceDatabase } from "../../service-database/service-database.js";

// The app-facing realization of `State.playMove`: a local placement needs no
// outside capability, so it commits the move through a single transaction.
export const playMove = (db: ServiceDatabase, args: PlayMoveArgs) => {
  db.transactions.playMove(args);
};
