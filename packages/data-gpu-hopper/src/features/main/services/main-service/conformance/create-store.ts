// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "@adobe/data/ecs";
import { CoreDatabase } from "../core-database/core-database.js";

// A fresh writable store carrying the feature's whole schema. Hopper has no
// index layer, so `CoreDatabase` is the lowest (and only schema) layer, and
// `Store.create` reads its schema facets directly. Typed as `CoreDatabase.Store`:
// the surface the projection (`fromState` / `toState`) and the raw transaction
// functions use. Test-only.
export const createStore = (): CoreDatabase.Store => Store.create(CoreDatabase.plugin);
