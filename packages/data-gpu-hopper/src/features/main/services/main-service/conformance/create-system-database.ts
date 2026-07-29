// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { FeatureDatabase } from "../feature-database.js";

// The assembled feature database viewed as its writable *system surface* — the
// same `Database & { store }` a system's `create(db)` receives — obtained
// cast-free through the library lens `Database.toSystemDatabase`. ONLY the system
// tick-loop / selection tests need it: they drive the systems through
// `db.system.functions` and reach the store via `db.store`. Transaction and
// projection conformance use `createStore` instead. Test-only.
export const createSystemDatabase = (): Database.Plugin.ToSystemDatabase<
  typeof FeatureDatabase.plugin
> => Database.toSystemDatabase(Database.create(FeatureDatabase.plugin));
