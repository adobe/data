// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "@adobe/data/ecs";
import type { CoreDatabase } from "../core-database/core-database.js";
import { IndexDatabase } from "../index-database/index-database.js";

// A fresh writable store carrying the feature's whole schema. `IndexDatabase` is
// the lowest layer that declares it all (components / resources / archetypes +
// indexes) — the behaviour layers above (transactions / computed / systems) add
// none — and `Store.create` reads a plugin's schema facets directly. Typed as
// `CoreDatabase.Store`: the surface the projection (`fromState` / `toState`) and
// the raw transaction functions use. Test-only.
export const createStore = (): CoreDatabase.Store => Store.create(IndexDatabase.plugin);
