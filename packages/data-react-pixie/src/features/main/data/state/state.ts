// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "../sprite/sprite.js";
import type { FilterKind } from "../filter-kind/filter-kind.js";

// The full application state as one immutable object — the specification the
// ECS implementation is verified against. `sprites` is an unordered collection;
// `filter` is the scene-wide colour filter.
export type State = {
  readonly sprites: readonly Sprite[];
  readonly filter: FilterKind;
};
export * as State from "./public.js";
