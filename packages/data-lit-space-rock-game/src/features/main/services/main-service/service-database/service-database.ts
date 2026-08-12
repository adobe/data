// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Assert, Equal } from "@adobe/data/types";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import { RandomService } from "../../random-service/random-service.js";
import type { Services } from "../../services.js";

// Extends the computed database with the `services` facet. `random` is a
// capability port with no ECS state to bind, so it is registered directly from
// its `services/` contract (like data-lit-todo's `nameGenerator`): production
// uses the real `Math.random`-backed source; tests inject
// `RandomService.createFake` through the `Database.create` service override.
// Consumers reach it as `db.services.random`.
const serviceDatabasePlugin = Database.Plugin.create({
  extends: ComputedDatabase.plugin,
  services: {
    random: RandomService.create,
  },
});

export type ServiceDatabase = Database.Plugin.ToDatabase<typeof serviceDatabasePlugin>;

// Drift-guard: the services the ECS resolves onto `db.services` must exactly match
// the injectable `Services` map the data transitions `Pick` from.
type _ServicesPin = Assert<Equal<ServiceDatabase["services"], Services>>;

export namespace ServiceDatabase {
  export const plugin = serviceDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof serviceDatabasePlugin>;
}
