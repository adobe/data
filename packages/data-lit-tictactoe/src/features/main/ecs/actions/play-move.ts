// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { PlayMoveArgs } from "../../data/values/play-move-args/play-move-args.js";
import type { ServiceDatabase } from "../services/service-database.js";

// A local placement needs no outside capability: it commits one transaction.
export const playMove = (db: ServiceDatabase, args: PlayMoveArgs) => {
  db.transactions.playMove(args);
};
