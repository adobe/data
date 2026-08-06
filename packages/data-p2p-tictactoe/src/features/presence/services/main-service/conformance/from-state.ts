// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to match a `data/` presence `State`. The inverse of `toState`.
// Test-only.
export const fromState = (store: CoreDatabase.Store, state: State): void => {
  store.resources.cursors = state.cursors;
};
