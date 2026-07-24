// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { Ship } from "../ship/ship.js";
import { spawnWave } from "./spawn-wave.js";

// A fresh game for a `bounds`-sized field: ship centred, no bullets, three
// lives, zero score, and the first wave of asteroids spawned in.
export const createInitial = (bounds: Vec2): State =>
  spawnWave({
    bounds,
    ship: Ship.spawn(Vec2.scale(bounds, 0.5)),
    bullets: [],
    asteroids: [],
    score: 0,
    lives: 3,
    wave: 0,
  });
