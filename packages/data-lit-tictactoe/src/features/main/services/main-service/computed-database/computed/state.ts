// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import type { State } from "../../../../data/state/state.js";
import type { IndexDatabase } from "../../index-database/index-database.js";
import { board } from "./board.js";

// The full logical `State` projected from the ECS — the conformance anchor
// between the data-layer spec and this implementation. Reuses the `board`
// computed (which folds the placed-mark entities into the board string) and joins
// it with the scalar resource observables, so the mark-fold lives in exactly one
// place. Re-emits whenever the board or any counter changes.
export const state = cached((db: IndexDatabase): Observe<State> =>
  Observe.fromProperties({
    board: board(db),
    firstPlayer: db.observe.resources.firstPlayer,
    xWins: db.observe.resources.xWins,
    oWins: db.observe.resources.oWins,
    draws: db.observe.resources.draws,
  }),
);
