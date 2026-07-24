// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Whether the game is over, projected from the `lives` resource through the
// pure data/ rule (State.isGameOver → lives spent). The "game over" test lives
// in data/, so the UI never inlines `lives <= 0`. Reads only resources.lives,
// so it types on the lowest layer that exposes it: CoreDatabase.
export const gameOver = cached((db: CoreDatabase) =>
  Observe.withFilter(db.observe.resources.lives, (lives) => State.isGameOver({ lives })),
);
