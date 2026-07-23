// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `loseLife` conforms to `State.resolveShipHits`. The transform decides whether
// the ship is struck AND applies the consequence; the transaction is only the
// struck branch (spend a life, respawn at centre) — the collision system
// dispatches it exactly when the ship overlaps an asteroid. The `apply` closure
// reproduces that decision from the seeded store: it dispatches `loseLife` iff
// the ship is struck, so the outcome equals the transform on every case
// (struck, untouched, lives already zero, and the empty field).
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { Collision } from "../../../data/collision/collision.js";
import { Ship } from "../../../data/ship/ship.js";
import { Asteroid } from "../../../data/asteroid/asteroid.js";
import { cases } from "../../../data/state/resolve-ship-hits.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { loseLife } from "./lose-life.js";

describe("loseLife transaction conforms to State.resolveShipHits", () => {
  expectConforms({
    cases,
    spec: (before) => State.resolveShipHits(before),
    apply: (store) => {
      const [shipId] = store.select(store.archetypes.Ship.components);
      if (shipId === undefined) return;
      const shipRow = store.read(shipId, store.archetypes.Ship);
      if (shipRow === null) return;
      let struck = false;
      for (const asteroid of store.select(store.archetypes.Asteroid.components)) {
        const asteroidRow = store.read(asteroid, store.archetypes.Asteroid);
        if (asteroidRow === null) continue;
        if (
          Collision.circlesOverlap(
            shipRow.position,
            Ship.radius,
            asteroidRow.position,
            Asteroid.radius(asteroidRow),
          )
        ) {
          struck = true;
          break;
        }
      }
      if (struck) loseLife(store);
    },
  });
});
