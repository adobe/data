// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { Ship } from "../ship/ship.js";

// Spec-owned `{ before, args, after }` cases for `State.resolveShipHits` (no
// args), shared with the ecs `loseLife` transaction (dispatched by the
// collision system only when the ship is actually struck). A touching asteroid
// costs one life (floored at 0) and respawns the ship at the field centre;
// otherwise the state is untouched. Field 200×200 → centre [100,100];
// Ship.radius 12, large asteroid radius 40. Respawn = Ship.spawn(centre) =
// { [100,100], [0,0], −π/2 }; the asteroids are left in place.
const field = { ...State.create(), bounds: [200, 200] as [number, number] };
const respawned = Ship.spawn([100, 100]);

export const cases: readonly ConformanceCase<undefined>[] = [
  {
    name: "an asteroid on the ship costs a life and respawns it at centre",
    before: {
      ...field,
      ship: { position: [10, 10], velocity: [5, 5], rotation: 1 },
      asteroids: [{ position: [10, 10], velocity: [0, 0], size: "large" }],
      lives: 3,
    },
    args: undefined,
    after: {
      ...field,
      ship: respawned,
      asteroids: [{ position: [10, 10], velocity: [0, 0], size: "large" }],
      lives: 2,
    },
  },
  {
    name: "no asteroid touching the ship is a no-op",
    before: {
      ...field,
      ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
      asteroids: [{ position: [500, 500], velocity: [0, 0], size: "large" }],
      lives: 3,
    },
    args: undefined,
    after: {
      ...field,
      ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
      asteroids: [{ position: [500, 500], velocity: [0, 0], size: "large" }],
      lives: 3,
    },
  },
  {
    name: "lives never drop below zero, and the ship still respawns",
    before: {
      ...field,
      ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
      asteroids: [{ position: [10, 10], velocity: [0, 0], size: "large" }],
      lives: 0,
    },
    args: undefined,
    after: {
      ...field,
      ship: respawned,
      asteroids: [{ position: [10, 10], velocity: [0, 0], size: "large" }],
      lives: 0,
    },
  },
  {
    name: "boundary: distance exactly equal to the radius sum still counts as a hit",
    before: {
      ...field,
      ship: { position: [0, 0], velocity: [0, 0], rotation: 0 },
      asteroids: [{ position: [52, 0], velocity: [0, 0], size: "large" }],
      lives: 3,
    },
    args: undefined,
    after: {
      ...field,
      ship: respawned,
      asteroids: [{ position: [52, 0], velocity: [0, 0], size: "large" }],
      lives: 2,
    },
  },
  {
    name: "an empty field is a no-op",
    before: {
      ...field,
      ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
      asteroids: [],
      lives: 3,
    },
    args: undefined,
    after: {
      ...field,
      ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
      asteroids: [],
      lives: 3,
    },
  },
];
