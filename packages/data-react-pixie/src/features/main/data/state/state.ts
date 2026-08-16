// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "../sprite/sprite.js";
import type { FilterKind } from "../filter-kind/filter-kind.js";

// The full application state as one immutable object — the specification the
// ECS implementation is verified against. `filter` is the scene-wide colour
// filter (a singleton → an ECS resource); `entities` holds every sprite keyed
// by a numeric id, the value carrying no id (identity is the key).
export type State = {
  readonly filter: FilterKind;
  readonly entities: ReadonlyMap<number, Sprite>;
};
export * as State from "./public.js";
