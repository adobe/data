// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// The test-only store ⇄ `State` projection. Presence keeps its whole state in the
// `cursors` resource — there are no entity collections — so `fromState` seeds that one
// resource and returns an empty `id → entity` map (the runners' `resolve` is never
// used), and there is no per-entity `toData`. Shared by the manifest (`data/state/spec.ts`)
// and, because presence conforms its ecs via the lower-level runners, by the escape-hatch
// tests and the projection round-trip test.
const fromState = (store: CoreDatabase.Store, state: State): ReadonlyMap<never, Entity> => {
  store.resources.cursors = state.cursors;
  return new Map<never, Entity>();
};

const toState = (store: CoreDatabase.Store): State => ({ cursors: store.resources.cursors });

export const projection = { fromState, toState };
