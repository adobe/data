// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert } from "@adobe/data/types";
import type { Conformance } from "@adobe/data-testing";
import type { Sprite } from "../data/entities/sprite.js";
import type { FilterKind } from "../data/values/filter-kind/filter-kind.js";
import type { components } from "../data/components/index.js";
import type { resources } from "../data/resources/index.js";

// The full application state as one immutable object — the specification the
// ECS implementation is verified against. `filter` is the scene-wide colour
// filter (a singleton → an ECS resource); `entities` holds every sprite keyed
// by a numeric id, the value carrying no id (identity is the key).
export type State = {
  readonly filter: FilterKind;
  readonly entities: ReadonlyMap<number, Sprite>;
};

// Singleton keys name resources; entity value keys name components.
type _Pin = Assert<Conformance.StateMatches<State, typeof resources, typeof components>>;

export * as State from "./public.js";
