// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to exactly match a `data/` `State`. The whole state is scalar
// resources, so seeding is three assignments — the inverse of `toState`.
// Test-only bridge that lets an ecs mutation be checked against the pure
// transform it stands for (see `expect-conforms.ts`).
export const fromState = (store: CoreDatabase.Store, state: State): void => {
  store.resources.count = state.count;
  store.resources.log = state.log;
  store.resources.userName = state.userName;
};
