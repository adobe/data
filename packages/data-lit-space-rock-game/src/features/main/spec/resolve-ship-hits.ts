// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { Ship } from "../data/values/ship/ship.js";
import { Asteroid } from "../data/values/asteroid/asteroid.js";
import { Collision } from "../data/values/collision/collision.js";

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
