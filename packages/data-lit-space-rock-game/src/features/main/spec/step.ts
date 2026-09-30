// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Input } from "../data/values/input/input.js";
import { stepShip } from "./step-ship.js";
import { fireBullet } from "./fire-bullet.js";
import { stepBullets } from "./step-bullets.js";
import { stepAsteroids } from "./step-asteroids.js";
import { resolveBulletHits } from "./resolve-bullet-hits.js";
import { resolveShipHits } from "./resolve-ship-hits.js";
import { spawnRandomWave } from "./spawn-random-wave.js";
import { Lives } from "../data/values/lives/lives.js";
import type { Services } from "../services/services.js";

// Advance the whole game one tick: move the ship, fire, advance bullets and
// asteroids, resolve collisions, then refill the wave if the field is clear. A game
// that is over is frozen. Realized by one frame of the ECS systems.
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
  if (Lives.isGameOver(state.lives)) {
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
