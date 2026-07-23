// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import type { Ship } from "../../data/ship/ship.js";
import type { Asteroid } from "../../data/asteroid/asteroid.js";
import type { Bullet } from "../../data/bullet/bullet.js";
import { components } from "./components.js";

// The three entity shapes. Each is a genuinely distinct component set; the
// shared columns (`position`, `velocity`) are referenced by identity from the
// single declaration in components.ts. There is no stored broad-phase column —
// the `byCell` index derives the cell from `position` (see
// index-database/indexes/by-cell.ts) — so each archetype's shape equals exactly
// the data/ row type it materialises.
export const archetypes = Database.archetypes(components, {
  Ship: ["position", "velocity", "rotation"],
  Asteroid: ["position", "velocity", "size"],
  Bullet: ["position", "velocity", "age"],
});

// Drift guards: each archetype's row shape must equal the data/ row type it
// mirrors — the guard fails to compile if any column and its data type diverge.
const shipSchema = Schema.fromArchetype(components, archetypes.Ship);
type _ShipMatches = Assert<Equal<Schema.ToType<typeof shipSchema>, Ship>>;

const asteroidSchema = Schema.fromArchetype(components, archetypes.Asteroid);
type _AsteroidMatches = Assert<Equal<Schema.ToType<typeof asteroidSchema>, Asteroid>>;

const bulletSchema = Schema.fromArchetype(components, archetypes.Bullet);
type _BulletMatches = Assert<Equal<Schema.ToType<typeof bulletSchema>, Bullet>>;
