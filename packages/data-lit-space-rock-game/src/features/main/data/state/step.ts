// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Input } from "../input/input.js";
import { stepShip } from "./step-ship.js";
import { fireBullet } from "./fire-bullet.js";
import { stepBullets } from "./step-bullets.js";
import { stepAsteroids } from "./step-asteroids.js";
import { resolveBulletHits } from "./resolve-bullet-hits.js";
import { resolveShipHits } from "./resolve-ship-hits.js";
import { spawnRandomWave } from "./spawn-random-wave.js";
import { isGameOver } from "./is-game-over.js";
import { RandomService } from "../../services/random-service/random-service.js";

// Advance the whole game one tick. This is the authoritative spec the ECS
// systems are verified against: move the ship, fire, advance bullets and
// asteroids, resolve collisions, then refill the wave if the field is clear.
// A game that is over is frozen (idempotent).
//
// The refill draws randomness, so `step` threads an injected `random` service
// down to `spawnRandomWave` — keeping the whole tick deterministic GIVEN the
// service (inject a fixed sequence and one frame is fixed). The runtime ECS
// `waves` system supplies the real `Math.random`-backed source; because that
// source cannot be shared with the pure oracle frame-for-frame, the shared
// tick-loop conformance cases never clear the field (the randomized refill is
// exercised directly in `spawn-random-wave.test.ts` / `step.test.ts` and
// conformed via the `spawnRandomWave` transaction).
export const step = (
  state: State,
  dt: number,
  input: Input,
  { random }: { random: RandomService },
): State => {
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
  next = spawnRandomWave(next, { random });
  return next;
};
