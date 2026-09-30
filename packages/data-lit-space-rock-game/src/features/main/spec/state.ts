// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { Assert } from "@adobe/data/types";
import type { Conformance } from "@adobe/data-testing";
import type { Ship } from "../data/values/ship/ship.js";
import type { Bullet } from "../data/values/bullet/bullet.js";
import type { Asteroid } from "../data/values/asteroid/asteroid.js";
import type { components } from "../data/components/index.js";
import type { resources } from "../data/resources/index.js";

// The whole game as one immutable value — the specification the ECS implementation
// is verified against. `entities` holds every bullet and asteroid in one
// identity-keyed map (the value carries no id); each entry is discriminated by its
// shape (`Bullet.is` / `Asteroid.is`).
export type State = {
  readonly bounds: Vec2;
  readonly ship: Ship;
  readonly entities: ReadonlyMap<number, Bullet | Asteroid>;
  readonly score: number;
  readonly lives: number;
  readonly wave: number;
};

// Singleton keys name resources; entity value keys name components.
type _Pin = Assert<Conformance.StateMatches<State, typeof resources, typeof components>>;

export * as State from "./public.js";
