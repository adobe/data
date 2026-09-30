// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { MainService } from "../main-service.js";

// The assembled feature database with its writable system surface (`db.store`,
// `db.system.functions`), for the tests that drive frames headlessly.
export const createSystemDatabase = (): Database.Plugin.ToSystemDatabase<typeof MainService.plugin> =>
  Database.toSystemDatabase(Database.create(MainService.plugin));
