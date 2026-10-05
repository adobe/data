// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Frog } from "../../data/values/frog/frog.js";
import type { CoreDatabase } from "../core/core-database.js";

// Spend a life: respawn the frog at the start, or end the game on the last life.
// Dispatched by the collision system.
export const loseLife = (t: CoreDatabase.Store) => {
  const { resources } = t;
  const lives = resources.lives - 1;
  if (lives <= 0) {
    resources.lives = 0;
    resources.status = "gameOver";
    return;
  }
  resources.lives = lives;
  resources.frog = Frog.start(resources.boardWidth);
};
