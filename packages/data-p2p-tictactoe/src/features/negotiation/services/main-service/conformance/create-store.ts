// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "@adobe/data/ecs";
import { CoreDatabase } from "../core-database/core-database.js";

// A fresh writable store carrying the negotiation schema. `CoreDatabase` is the
// lowest (and only) schema layer — the behaviour layers above add no schema — and
// `Store.create` reads a plugin's schema facets directly. Test-only.
export const createStore = (): CoreDatabase.Store => Store.create(CoreDatabase.plugin);
