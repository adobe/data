// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import { Ship } from "../../data/values/ship/ship.js";
import { Lives } from "../../data/values/lives/lives.js";
import { Wave } from "../../data/values/wave/wave.js";
import type { CoreDatabase } from "../core/core-database.js";
import { clearEntities } from "./clear-entities.js";
import { nextWave } from "./next-wave.js";

// Start a fresh game on a `bounds`-sized field: clear every entity, centre the
// ship, reset the counters, and spawn the first wave (every rock at the base speed).
export const createInitial = (
  t: CoreDatabase.Store,
  { bounds }: { readonly bounds: Vec2 },
): void => {
  clearEntities(t);
  t.resources.bounds = bounds;
  t.resources.ship = Ship.spawn(Vec2.scale(bounds, 0.5));
  t.resources.score = 0;
  t.resources.lives = Lives.initial;
  t.resources.wave = 0;
  nextWave(t, () => Wave.speed);
};
