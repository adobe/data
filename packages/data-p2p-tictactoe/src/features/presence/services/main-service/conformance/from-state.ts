// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to match a `data/` presence `State`. The inverse of `toState`.
// Presence keeps its whole state in the `cursors` resource — there are no entity
// collections — so the returned `spec id → seeded entity` map is empty and the
// conformance runners' `resolve` is never used. Test-only.
export const fromState = (
  store: CoreDatabase.Store,
  state: State,
): ReadonlyMap<never, Entity> => {
  store.resources.cursors = state.cursors;
  return new Map<never, Entity>();
};
