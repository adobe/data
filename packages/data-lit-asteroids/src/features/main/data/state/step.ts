// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Input } from "../input/input.js";
import { stepShip } from "./step-ship.js";
import { fireBullet } from "./fire-bullet.js";
import { stepBullets } from "./step-bullets.js";
import { stepAsteroids } from "./step-asteroids.js";
import { resolveBulletHits } from "./resolve-bullet-hits.js";
import { resolveShipHits } from "./resolve-ship-hits.js";
import { spawnWave } from "./spawn-wave.js";
import { isGameOver } from "./is-game-over.js";

// Advance the whole game one tick. This is the authoritative spec the ECS
// systems are verified against: move the ship, fire, advance bullets and
// asteroids, resolve collisions, then refill the wave if the field is clear.
// A game that is over is frozen (idempotent).
export const step = (state: State, dt: number, input: Input): State => {
  if (isGameOver(state)) {
    return state;
  }
  let next = stepShip(state, dt, input);
  if (input.fire) {
    next = fireBullet(next);
  }
  next = stepBullets(next, dt);
  next = stepAsteroids(next, dt);
  next = resolveBulletHits(next, dt);
  next = resolveShipHits(next);
  next = spawnWave(next);
  return next;
};
