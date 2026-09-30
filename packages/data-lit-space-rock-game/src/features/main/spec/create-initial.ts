// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { Ship } from "../data/values/ship/ship.js";
import { Lives } from "../data/values/lives/lives.js";
import { spawnWave } from "./spawn-wave.js";

// A fresh game for a `bounds`-sized field: ship centred, no bullets, full lives,
// zero score, and the first wave spawned. A reset: the prior `state` is ignored.
export const createInitial = (
  _state: State,
  { bounds }: { readonly bounds: Vec2 },
): State => {
  const fresh: State = {
    bounds,
    ship: Ship.spawn(Vec2.scale(bounds, 0.5)),
    entities: new Map(),
    score: 0,
    lives: Lives.initial,
    wave: 0,
  };
  return { ...fresh, ...spawnWave(fresh) };
};
