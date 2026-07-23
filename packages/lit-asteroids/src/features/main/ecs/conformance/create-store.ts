// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "@adobe/data/ecs";
import type { CoreDatabase } from "../core-database/core-database.js";
import { SystemDatabase } from "../system-database/system-database.js";

// A fresh writable store carrying the feature's whole schema — every component,
// resource, archetype, and index the assembled plugin declares — built cast-free
// from those facets with `Store.create` (no `Database` needed: a transaction is
// `(store, args) => void`). Typed as `CoreDatabase.Store` because the projection
// (`fromState` / `toState`) and the raw transaction functions touch only core
// entities, resources, and archetypes — the core surface is all they need.
// Backs the transaction and projection conformance tests. Test-only.
export const createStore = (): CoreDatabase.Store =>
  Store.create({
    components: SystemDatabase.plugin.components,
    resources: SystemDatabase.plugin.resources,
    archetypes: SystemDatabase.plugin.archetypes,
    indexes: SystemDatabase.plugin.indexes,
  });
