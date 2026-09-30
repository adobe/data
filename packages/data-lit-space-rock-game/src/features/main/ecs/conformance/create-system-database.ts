// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { MainService } from "../main-service.js";

// The assembled feature database viewed as its writable system surface — the same
// `Database & { store }` a system's `create(db)` receives — for the collision and
// waves tests, which drive systems through `db.system.functions`. Test-only.
export const createSystemDatabase = (): Database.Plugin.ToSystemDatabase<
  typeof MainService.plugin
> => Database.toSystemDatabase(Database.create(MainService.plugin));
