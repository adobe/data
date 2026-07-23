// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to exactly match a `data/` `State`: the calculator has no
// entities, so its whole state is the singleton `calculator` resource, which
// *is* a `State`. Seeding is a single assignment. The inverse of `toState`.
// Test-only — the bridge that lets an ecs mutation be checked against the pure
// transform it stands for (see `expect-conforms.ts`).
export const fromState = (store: CoreDatabase.Store, state: State): void => {
  store.resources.calculator = state;
};
