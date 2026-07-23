// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "@adobe/data/ecs";
import type { CoreDatabase } from "../core-database/core-database.js";
import { ComputedDatabase } from "../computed-database/computed-database.js";

// A fresh writable store carrying the feature's whole schema — every component,
// resource, archetype, and index the assembled plugin declares — built cast-free
// from those facets with `Store.create` (no `Database` needed: a transaction is
// `(store, args) => void`, and this feature runs no systems). The calculator has
// no entities: its whole state is the singleton `calculator` resource, so the
// `components` / `archetypes` / `indexes` facets are empty. Typed as
// `CoreDatabase.Store` because the projection (`fromState` / `toState`) and the
// raw transaction functions touch only that resource. Backs the transaction and
// projection conformance tests. Test-only.
export const createStore = (): CoreDatabase.Store =>
  Store.create({
    components: ComputedDatabase.plugin.components,
    resources: ComputedDatabase.plugin.resources,
    archetypes: ComputedDatabase.plugin.archetypes,
    indexes: ComputedDatabase.plugin.indexes,
  });
