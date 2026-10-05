// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import { Lives } from "../../data/values/lives/lives.js";
import type { CoreDatabase } from "../core/core-database.js";

// Whether the game is over, projected from the `lives` resource through the pure
// `Lives.isGameOver` rule, so the UI never inlines `lives <= 0`.
export const gameOver = cached((db: CoreDatabase) =>
  Observe.withFilter(db.observe.resources.lives, Lives.isGameOver),
);
