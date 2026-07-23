// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "@adobe/data/ecs";
import type { CoreDatabase } from "../core-database/core-database.js";
import { ActionDatabase } from "../action-database/action-database.js";

// A fresh writable store carrying the feature's whole schema — every component,
// resource, archetype, and index the assembled plugin declares — built cast-free
// from those facets with `Store.create` (no `Database` needed: a transaction is
// `(store, args) => void`, and this feature is turn-based so it runs no systems).
// Typed as `CoreDatabase.Store` because the projection (`fromState` / `toState`)
// and the raw transaction functions touch only core entities, resources, and
// archetypes — the core surface is all they need. Backs the transaction and
// projection conformance tests. Test-only.
export const createStore = (): CoreDatabase.Store =>
  Store.create({
    components: ActionDatabase.plugin.components,
    resources: ActionDatabase.plugin.resources,
    archetypes: ActionDatabase.plugin.archetypes,
    indexes: ActionDatabase.plugin.indexes,
  });
