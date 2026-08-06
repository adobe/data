// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read a store back into a `data/` presence `State`. The inverse of `fromState`.
// Test-only.
export const toState = (store: CoreDatabase.Store): State => ({
  cursors: store.resources.cursors,
});
