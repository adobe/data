// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { CoreDatabase } from "../../core-database/core-database.js";

// Set the play-field size. The UI dispatches this when the canvas mounts or
// resizes; newGame/spawnWave read `bounds` to place the ship and asteroid ring.
export const setBounds = (t: CoreDatabase.Store, bounds: Vec2): void => {
  t.resources.bounds = bounds;
};
