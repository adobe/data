// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { Ship } from "../ship/ship.js";
import { Input } from "../input/input.js";

// Spec-owned `{ before, args, after }` cases for the whole-tick `State.step`
// (args = { dt, input }), shared with the ecs system tick-loop conformance
// (one frame = one step). Each case exercises one branch of the step pipeline —
// advance/wrap, fire, bullet↔asteroid resolution, ship↔asteroid resolution,
// wave refill, and the game-over freeze — with geometry chosen so every `after`
// is exact (stationary bodies, clean quadrant wave, F32-representable numbers).
type Args = { readonly dt: number; readonly input: Input };

export const cases: readonly ConformanceCase<Args>[] = [
  {
    // Ship and an asteroid both advance and wrap; neither reaches the other.
    name: "advances and wraps every body (movement)",
    before: {
      bounds: [200, 200],
      ship: { position: [190, 100], velocity: [30, 0], rotation: 0 },
      bullets: [],
      asteroids: [{ position: [190, 180], velocity: [30, 30], size: "large" }],
      score: 0,
      lives: 3,
      wave: 1,
    },
    args: { dt: 1, input: Input.none },
    after: {
      bounds: [200, 200],
      ship: { position: [20, 100], velocity: [30, 0], rotation: 0 },
      bullets: [],
      asteroids: [{ position: [20, 10], velocity: [30, 30], size: "large" }],
      score: 0,
      lives: 3,
      wave: 1,
    },
  },
  {
    // fire fires from the POST-move ship (stepShip → fireBullet → stepBullets),
    // then the new bullet is advanced + aged the same tick.
    name: "fires from the post-move muzzle and advances the new bullet (lifetime)",
    before: {
      bounds: [400, 400],
      ship: { position: [100, 100], velocity: [0, 0], rotation: 0 },
      bullets: [],
      asteroids: [{ position: [350, 350], velocity: [0, 0], size: "large" }],
      score: 0,
      lives: 3,
      wave: 1,
    },
    args: { dt: 0.1, input: { turn: 0, thrust: false, fire: true } },
    after: {
      bounds: [400, 400],
      ship: { position: [100, 100], velocity: [0, 0], rotation: 0 },
      bullets: [{ position: [152, 100], velocity: [400, 0], age: 0.1 }],
      asteroids: [{ position: [350, 350], velocity: [0, 0], size: "large" }],
      score: 0,
      lives: 3,
      wave: 1,
    },
  },
  {
    // A stationary bullet overlapping a large asteroid: it scores 20 and the
    // rock splits into two stationary mediums; the far ship is untouched.
    name: "resolves a bullet↔asteroid hit (split + score)",
    before: {
      bounds: [800, 600],
      ship: { position: [700, 500], velocity: [0, 0], rotation: 0 },
      bullets: [{ position: [100, 100], velocity: [0, 0], age: 0 }],
      asteroids: [{ position: [100, 100], velocity: [0, 0], size: "large" }],
      score: 0,
      lives: 3,
      wave: 1,
    },
    args: { dt: 0.1, input: Input.none },
    after: {
      bounds: [800, 600],
      ship: { position: [700, 500], velocity: [0, 0], rotation: 0 },
      bullets: [],
      asteroids: [
        { position: [100, 100], velocity: [0, 0], size: "medium" },
        { position: [100, 100], velocity: [0, 0], size: "medium" },
      ],
      score: 20,
      lives: 3,
      wave: 1,
    },
  },
  {
    // An asteroid on the centred ship costs a life and respawns it at centre.
    name: "resolves a ship↔asteroid hit (lose a life, respawn at centre)",
    before: {
      bounds: [200, 200],
      ship: Ship.spawn([100, 100]),
      bullets: [],
      asteroids: [{ position: [100, 100], velocity: [0, 0], size: "large" }],
      score: 0,
      lives: 3,
      wave: 1,
    },
    args: { dt: 0.1, input: Input.none },
    after: {
      bounds: [200, 200],
      ship: Ship.spawn([100, 100]),
      bullets: [],
      asteroids: [{ position: [100, 100], velocity: [0, 0], size: "large" }],
      score: 0,
      lives: 2,
      wave: 1,
    },
  },
  {
    // A clear field refills: wave 0 → 1 (asteroidsFor(1)=4) as a clean quadrant
    // ring. spawnWave runs AFTER resolveShipHits, so the new rocks don't strike
    // the ship this tick.
    name: "refills the field with a new wave once it is clear",
    before: {
      bounds: [200, 200],
      ship: Ship.spawn([100, 100]),
      bullets: [],
      asteroids: [],
      score: 0,
      lives: 3,
      wave: 0,
    },
    args: { dt: 0.1, input: Input.none },
    after: {
      bounds: [200, 200],
      ship: Ship.spawn([100, 100]),
      bullets: [],
      asteroids: [
        { position: [180, 100], velocity: [0, 60], size: "large" },
        { position: [100, 180], velocity: [-60, 0], size: "large" },
        { position: [20, 100], velocity: [0, -60], size: "large" },
        { position: [100, 20], velocity: [60, 0], size: "large" },
      ],
      score: 0,
      lives: 3,
      wave: 1,
    },
  },
  {
    // Lives spent: the whole tick is frozen (idempotent). Every system must
    // honour the game-over guard, so nothing — ship, bullet, asteroid — moves.
    name: "freezes the whole tick once the game is over",
    before: {
      bounds: [200, 200],
      ship: { position: [50, 50], velocity: [10, 0], rotation: 0 },
      bullets: [{ position: [60, 60], velocity: [0, 0], age: 0.5 }],
      asteroids: [{ position: [100, 100], velocity: [0, 0], size: "large" }],
      score: 40,
      lives: 0,
      wave: 2,
    },
    args: { dt: 0.1, input: { turn: 1, thrust: true, fire: true } },
    after: {
      bounds: [200, 200],
      ship: { position: [50, 50], velocity: [10, 0], rotation: 0 },
      bullets: [{ position: [60, 60], velocity: [0, 0], age: 0.5 }],
      asteroids: [{ position: [100, 100], velocity: [0, 0], size: "large" }],
      score: 40,
      lives: 0,
      wave: 2,
    },
  },
];
