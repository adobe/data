// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to exactly match a `data/` `State`. The whole state is scalar
// resources, so seeding is three assignments — the inverse of `toState`.
// Test-only bridge that lets an ecs mutation be checked against the pure
// transform it stands for.
//
// The conformance runners resolve id-addressed operations generically through the
// `spec id → seeded entity` map this returns. This feature has no entities (only
// scalar resources), so nothing is id-addressed and the map is always empty.
export const fromState = (
  store: CoreDatabase.Store,
  state: State,
): ReadonlyMap<number, Entity> => {
  store.resources.count = state.count;
  store.resources.log = state.log;
  store.resources.userName = state.userName;
  return new Map();
};
