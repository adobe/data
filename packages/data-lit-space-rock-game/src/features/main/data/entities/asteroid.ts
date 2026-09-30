// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { Assert, Equal } from "@adobe/data/types";
import type { components } from "../components/index.js";
import type { Asteroid as AsteroidValue } from "../values/asteroid/asteroid.js";

// An asteroid: its row is exactly the `Asteroid` value.
export const Asteroid = ["position", "velocity", "size"] as const satisfies Database.EntityComponents<typeof components>;
export type Asteroid = Database.EntityType<typeof components, typeof Asteroid>;

type _Pin = Assert<Equal<Asteroid, AsteroidValue>>;
