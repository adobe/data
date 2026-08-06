// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "@adobe/data/ecs";
import { CoreDatabase } from "../core-database/core-database.js";

// A fresh writable store carrying the feature's whole schema. This feature has
// no indexes, so `CoreDatabase` is the lowest (and only) layer that declares all
// the schema; `Store.create` reads a plugin's schema facets directly. Test-only.
export const createStore = (): CoreDatabase.Store => Store.create(CoreDatabase.plugin);
