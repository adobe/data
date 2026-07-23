// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Vec2, F32 } from "@adobe/data/math";
import { Size } from "../../data/size/size.js";

// The shared entity component columns, bound by identity to their data/ schemas.
// `position` and `velocity` are declared once and referenced by the Ship,
// Asteroid, and Bullet archetypes alike. Radius is derived (from `size` for
// asteroids, from constants for ship/bullet) so it is not stored as a column.
// The broad-phase spatial cell is NOT stored: `byCell` is a computed-key index
// that derives it from `position` on demand (see index-database/indexes/by-cell),
// so there is no `cell` column to keep in sync. All state is `session` scope:
// the game is client-local and ephemeral.
export const components = Database.components({
  session: {
    position: Vec2.schema,
    velocity: Vec2.schema,
    rotation: F32.schema,
    size: Size.schema,
    age: F32.schema,
  },
});
