// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "@adobe/data/ecs";
import { CoreDatabase } from "../core-database/core-database.js";

// A fresh writable store carrying the feature's whole schema. `CoreDatabase` is
// the lowest — and, with no index-database, only — schema layer; the behaviour
// layers above add none, and `Store.create` reads a plugin's schema facets
// directly. The calculator has no entities: its whole state is the singleton
// `calculator` resource. Typed as `CoreDatabase.Store`: the surface the
// projection (`fromState` / `toState`) and the raw transaction functions use.
// Test-only.
export const createStore = (): CoreDatabase.Store => Store.create(CoreDatabase.plugin);
