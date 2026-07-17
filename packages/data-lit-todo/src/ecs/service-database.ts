// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { ComputedDatabase } from "./computed-database.js";
import { NameGeneratorService } from "../services/name-generator-service/name-generator-service.js";
import { TodoAnalyticsService } from "../services/todo-analytics-service/todo-analytics-service.js";

// These services are outbound ports with no ECS state to bind, so they are
// registered directly from their `services/` contracts. A service that reads
// db observables or calls transactions would instead get a factory in
// `ecs/services/` (see the tic-tac-toe sample).
const serviceDatabasePlugin = Database.Plugin.create({
  extends: ComputedDatabase.plugin,
  services: {
    nameGenerator: (): NameGeneratorService => NameGeneratorService.create(),
    todoAnalytics: (): TodoAnalyticsService => TodoAnalyticsService.create(),
  },
});

export type ServiceDatabase = Database.Plugin.ToDatabase<
  typeof serviceDatabasePlugin
>;

export namespace ServiceDatabase {
  export const plugin = serviceDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof serviceDatabasePlugin>;
}
