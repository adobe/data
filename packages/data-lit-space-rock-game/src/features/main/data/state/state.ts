// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { Ship } from "../ship/ship.js";
import type { Bullet } from "../bullet/bullet.js";
import type { Asteroid } from "../asteroid/asteroid.js";

// The whole game modelled as one immutable value — the pure specification the
// ECS implementation is verified against. Everything advances by `dt` each
// tick via `State.step`.
export type State = {
  readonly bounds: Vec2; // play-field size [width, height]; entities wrap within it
  readonly ship: Ship;
  readonly bullets: readonly Bullet[];
  readonly asteroids: readonly Asteroid[];
  readonly score: number;
  readonly lives: number;
  readonly wave: number;
};
export * as State from "./public.js";
