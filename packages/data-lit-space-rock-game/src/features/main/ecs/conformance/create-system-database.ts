// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { FeatureDatabase } from "../feature-database.js";

// The assembled feature database viewed as its writable *system surface* — the
// same `Database & { store }` a system's `create(db)` receives — obtained
// cast-free through the library lens `Database.toSystemDatabase` (the widening
// twin of `UIService.restrict`). ONLY the system tick-loop / detection tests
// need it: they drive the systems through `db.system.functions` and reach the
// store via `db.store`. Transaction and projection conformance use `createStore`
// instead (a transaction needs no `Database`). Test-only.
export const createSystemDatabase = (): Database.Plugin.ToSystemDatabase<
  typeof FeatureDatabase.plugin
> => Database.toSystemDatabase(Database.create(FeatureDatabase.plugin));
