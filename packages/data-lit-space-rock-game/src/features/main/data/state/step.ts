// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Input } from "../input/input.js";
import { stepShip } from "./step-ship.js";
import { fireBullet } from "./fire-bullet.js";
import { stepBullets } from "./step-bullets.js";
import { stepAsteroids } from "./step-asteroids.js";
import { resolveBulletHits } from "./resolve-bullet-hits.js";
import { resolveShipHits } from "./resolve-ship-hits.js";
import { spawnRandomWave } from "./spawn-random-wave.js";
import { isGameOver } from "./is-game-over.js";
import type { Services } from "../../services/services.js";

// Advance the whole game one tick. This is the authoritative spec the ECS systems
// are verified against: move the ship, fire, advance bullets and asteroids,
// resolve collisions, then refill the wave if the field is clear. A game that is
// over is frozen (idempotent). `dt`, `input`, and the injected `random` service
// are bundled into one args object (second parameter) so the co-located
// conformance cases derive their `args` type from this signature.
//
// The refill draws randomness, so `step` threads the injected `random` service
// down to `spawnRandomWave` — keeping the whole tick deterministic GIVEN the
// service. The runtime ECS `waves` system supplies a real `Math.random`-backed
// source; because that source cannot be shared with the pure oracle
// frame-for-frame, the shared tick-loop conformance cases never clear the field
// (the randomized refill is exercised directly in `spawn-random-wave.ts` cases and
// conformed via the `spawnRandomWave` transaction).
export const step = (
  state: State,
  {
    dt,
    input,
    random,
  }: {
    readonly dt: number;
    readonly input: Input;
  } & Pick<Services, "random">,
): State => {
  if (isGameOver(state)) {
    return state;
  }
  // Each sub-transition returns only the fields it writes; layer each patch over
  // the running full state so the whole tick composes into one State.
  let next: State = { ...state, ...stepShip(state, { dt, input }) };
  if (input.fire) {
    next = { ...next, ...fireBullet(next) };
  }
  next = { ...next, ...stepBullets(next, { dt }) };
  next = { ...next, ...stepAsteroids(next, { dt }) };
  next = { ...next, ...resolveBulletHits(next, { dt }) };
  next = { ...next, ...resolveShipHits(next) };
  next = { ...next, ...spawnRandomWave(next, { random }) };
  return next;
};
