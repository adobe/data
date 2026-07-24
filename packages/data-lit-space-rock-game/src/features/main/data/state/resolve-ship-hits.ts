// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { Ship } from "../ship/ship.js";
import { Asteroid } from "../asteroid/asteroid.js";
import { Collision } from "../collision/collision.js";

// If any asteroid is touching the ship, it costs a life and the ship respawns
// at the centre. No collision leaves the state untouched (idempotent).
export const resolveShipHits = <
  T extends Pick<State, "ship" | "asteroids" | "lives" | "bounds">,
>(
  state: T,
): T => {
  const struck = state.asteroids.some((a) =>
    Collision.circlesOverlap(state.ship.position, Ship.radius, a.position, Asteroid.radius(a)),
  );
  if (!struck) {
    return state;
  }
  return {
    ...state,
    lives: Math.max(0, state.lives - 1),
    ship: Ship.spawn(Vec2.scale(state.bounds, 0.5)),
  };
};
