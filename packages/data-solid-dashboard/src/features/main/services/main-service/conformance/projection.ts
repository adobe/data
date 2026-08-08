// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// The test-only ecs↔`State` projection, passed to `Conformance.runFeature`.
// `fromState` seeds a store to a `State`; the whole state is scalar resources, so
// seeding is three assignments, it mints no ids and returns an empty map.
// `toState` reads it back — the inverse. No entities, so no `toData`.
export const projection = {
  fromState: (
    store: CoreDatabase.Store,
    state: State,
  ): ReadonlyMap<number, Entity> => {
    store.resources.count = state.count;
    store.resources.log = state.log;
    store.resources.userName = state.userName;
    return new Map();
  },
  toState: (store: CoreDatabase.Store): State => ({
    count: store.resources.count,
    log: store.resources.log,
    userName: store.resources.userName,
  }),
};
