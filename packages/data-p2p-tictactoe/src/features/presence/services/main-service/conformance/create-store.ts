// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "@adobe/data/ecs";
import { CoreDatabase } from "../core-database/core-database.js";

// A fresh writable store carrying the presence schema. `CoreDatabase` is the only
// schema layer. Test-only.
export const createStore = (): CoreDatabase.Store => Store.create(CoreDatabase.plugin);
