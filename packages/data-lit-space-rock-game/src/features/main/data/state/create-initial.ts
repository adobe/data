// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { Ship } from "../ship/ship.js";
import { spawnWave } from "./spawn-wave.js";

// A fresh game for a `bounds`-sized field: ship centred, no bullets, three lives,
// zero score, and the first wave of asteroids spawned in. This is a "new game"
// TRANSITION — it produces a fresh game from the `bounds` alone and deliberately
// **ignores** the prior `state` (a reset), which is exactly what the ecs `newGame`
// transaction it maps to does (it clears whatever was there). The prior state is
// still the transition's first parameter so it fits the `(state, args) => state`
// shape the co-located conformance cases derive their `args` type from.
export const createInitial = (
  _state: State,
  { bounds }: { readonly bounds: Vec2 },
): State => {
  const fresh: State = {
    bounds,
    ship: Ship.spawn(Vec2.scale(bounds, 0.5)),
    entities: new Map(),
    score: 0,
    lives: 3,
    wave: 0,
  };
  // spawnWave returns only { entities, wave }; layer it over the fresh game.
  return { ...fresh, ...spawnWave(fresh) };
};
