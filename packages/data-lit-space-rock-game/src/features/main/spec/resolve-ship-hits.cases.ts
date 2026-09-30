// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { resolveShipHits } from "./resolve-ship-hits.js";
import { create } from "./create.js";
import { Ship } from "../data/values/ship/ship.js";

// Cases for the `resolveShipHits` helper `step` composes (no args). A touching asteroid costs one life (floored at 0)
// and respawns the ship at the field centre; otherwise the state is untouched. Field
// 200×200 → centre [100,100]; Ship.radius 12, large asteroid radius 40. Respawn =
// Ship.spawn(centre) = { [100,100], [0,0], −π/2 }; the asteroids stay in place.
const field = { ...create(), bounds: [200, 200] as [number, number] };
const respawned = Ship.spawn([100, 100]);

export const cases: Conformance.SpecCases<State, typeof resolveShipHits> = {
  cases: [
    {
      name: "an asteroid on the ship costs a life and respawns it at centre",
      before: {
        ...field,
        ship: { position: [10, 10], velocity: [5, 5], rotation: 1 },
        entities: new Map([[1, { position: [10, 10], velocity: [0, 0], size: "large" }]]),
        lives: 3,
      },
      after: {
        ...field,
        ship: respawned,
        entities: new Map([[1, { position: [10, 10], velocity: [0, 0], size: "large" }]]),
        lives: 2,
      },
    },
    {
      name: "no asteroid touching the ship is a no-op",
      before: {
        ...field,
        ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
        entities: new Map([[1, { position: [500, 500], velocity: [0, 0], size: "large" }]]),
        lives: 3,
      },
      after: {
        ...field,
        ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
        entities: new Map([[1, { position: [500, 500], velocity: [0, 0], size: "large" }]]),
        lives: 3,
      },
    },
    {
      name: "lives never drop below zero, and the ship still respawns",
      before: {
        ...field,
        ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
        entities: new Map([[1, { position: [10, 10], velocity: [0, 0], size: "large" }]]),
        lives: 0,
      },
      after: {
        ...field,
        ship: respawned,
        entities: new Map([[1, { position: [10, 10], velocity: [0, 0], size: "large" }]]),
        lives: 0,
      },
    },
    {
      name: "boundary: distance exactly equal to the radius sum still counts as a hit",
      before: {
        ...field,
        ship: { position: [0, 0], velocity: [0, 0], rotation: 0 },
        entities: new Map([[1, { position: [52, 0], velocity: [0, 0], size: "large" }]]),
        lives: 3,
      },
      after: {
        ...field,
        ship: respawned,
        entities: new Map([[1, { position: [52, 0], velocity: [0, 0], size: "large" }]]),
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
      after: {
        ...field,
        ship: { position: [10, 10], velocity: [0, 0], rotation: 0 },
        entities: new Map(),
        lives: 3,
      },
    },
  ],
};
