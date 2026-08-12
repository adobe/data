// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Assert, Equal } from "@adobe/data/types";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import { NameGeneratorService } from "../../name-generator-service/name-generator-service.js";
import { AnalyticsService } from "../../analytics-service/analytics-service.js";
import type { Services } from "../../services.js";

// These services are async ports with no ECS state to bind, so they are
// registered directly from their `services/` contracts. A service that reads
// db observables or calls transactions would instead get a factory in
// `ecs/services/` (see the tic-tac-toe sample).
const serviceDatabasePlugin = Database.Plugin.create({
  extends: ComputedDatabase.plugin,
  services: {
    nameGenerator: NameGeneratorService.create,
    analytics: AnalyticsService.create,
  },
});

export type ServiceDatabase = Database.Plugin.ToDatabase<
  typeof serviceDatabasePlugin
>;

// Drift-guard: the services the ECS resolves onto `db.services` must exactly match
// the injectable `Services` map the data transitions `Pick` from.
type _ServicesPin = Assert<Equal<ServiceDatabase["services"], Services>>;

export namespace ServiceDatabase {
  export const plugin = serviceDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof serviceDatabasePlugin>;
}
