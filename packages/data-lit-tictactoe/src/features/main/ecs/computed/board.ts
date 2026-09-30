// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import type { IndexDatabase } from "../indexes/index-database.js";
import { readBoard } from "../transactions/read-board.js";

// The board, folded from the placed-mark entities; re-emits whenever a mark is added
// or removed. `withCache` shares one run across every subscriber (each cell observes it).
export const board = cached((db: IndexDatabase) => Observe.withCache(db.derive(readBoard)));
