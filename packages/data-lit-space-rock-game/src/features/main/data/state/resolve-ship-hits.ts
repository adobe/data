// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import { Match } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { create } from "./create.js";
import { Ship } from "../ship/ship.js";
import { Asteroid } from "../asteroid/asteroid.js";
import { Collision } from "../collision/collision.js";

// If any asteroid is touching the ship, it costs a life and the ship respawns
// at the centre. No collision leaves the state untouched (idempotent).
export const resolveShipHits = (
  state: Pick<State, "ship" | "entities" | "lives" | "bounds">,
): Pick<State, "ship" | "lives"> => {
  const struck = [...state.entities.values()].some(
    (v) =>
      Asteroid.is(v) &&
      Collision.circlesOverlap(
        state.ship.position,
        Ship.radius,
        v.position,
        Asteroid.radius(v),
      ),
  );
  if (!struck) {
    return { ship: state.ship, lives: state.lives };
  }
  return {
    lives: Math.max(0, state.lives - 1),
    ship: Ship.spawn(Vec2.scale(state.bounds, 0.5)),
  };
};

// Spec-owned cases, shared with the ecs `loseLife` transaction (dispatched by the
// collision system only when the ship is actually struck). A touching asteroid
// costs one life (floored at 0) and respawns the ship at the field centre;
// otherwise the state is untouched. Field 200×200 → centre [100,100]; Ship.radius
// 12, large asteroid radius 40. Respawn = Ship.spawn(centre) = { [100,100], [0,0],
// −π/2 }; the asteroids are left in place.
const field = { ...create(), bounds: [200, 200] as [number, number] };
const respawned = Ship.spawn([100, 100]);

export const cases: Conformance<typeof resolveShipHits> = [
  {
    name: "an asteroid on the ship costs a life and respawns it at centre",
    before: {
      ...field,
      ship: { position: [10, 10], velocity: [5, 5], rotation: 1 },
      entities: new Map([
        [1, { position: [10, 10], velocity: [0, 0], size: "large" }],
      ]),
      lives: 3,
    },
    args: undefined,
    after: {
      ...field,
      ship: respawned,
      entities: new Map([
        [Match.ref("a"), { position: [10, 10], velocity: [0, 0], size: "large" }],
      ]),
      lives: 2,
    },
  },
  {
    name: "no asteroid touching the ship is a no-op",
    before: {
      ...field,
      ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [500, 500], velocity: [0, 0], size: "large" }],
      ]),
      lives: 3,
    },
    args: undefined,
    after: {
      ...field,
      ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
      entities: new Map([
        [Match.ref("a"), { position: [500, 500], velocity: [0, 0], size: "large" }],
      ]),
      lives: 3,
    },
  },
  {
    name: "lives never drop below zero, and the ship still respawns",
    before: {
      ...field,
      ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [10, 10], velocity: [0, 0], size: "large" }],
      ]),
      lives: 0,
    },
    args: undefined,
    after: {
      ...field,
      ship: respawned,
      entities: new Map([
        [Match.ref("a"), { position: [10, 10], velocity: [0, 0], size: "large" }],
      ]),
      lives: 0,
    },
  },
  {
    name: "boundary: distance exactly equal to the radius sum still counts as a hit",
    before: {
      ...field,
      ship: { position: [0, 0], velocity: [0, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [52, 0], velocity: [0, 0], size: "large" }],
      ]),
      lives: 3,
    },
    args: undefined,
    after: {
      ...field,
      ship: respawned,
      entities: new Map([
        [Match.ref("a"), { position: [52, 0], velocity: [0, 0], size: "large" }],
      ]),
      lives: 2,
    },
  },
  {
    name: "an empty field is a no-op",
    before: {
      ...field,
      ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
      entities: new Map(),
      lives: 3,
    },
    args: undefined,
    after: {
      ...field,
      ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
      entities: new Map(),
      lives: 3,
    },
  },
];
