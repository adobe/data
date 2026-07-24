// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";
import { readFrog } from "./read-frog.js";

// Spend a life (see State.loseLife): respawn the frog, or end the game on the
// last life. A discrete atomic event — the collision system dispatches this
// (rather than writing resources directly) so observers such as the HUD update.
export const loseLife = (t: CoreDatabase.Store) => {
  const { id, frog } = readFrog(t);
  const next = State.loseLife({
    lives: t.resources.lives,
    status: t.resources.status,
    frog,
    width: t.resources.width,
  });
  t.resources.lives = next.lives;
  t.resources.status = next.status;
  t.update(id, { x: next.frog.x, y: next.frog.y });
};
