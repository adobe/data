// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "../transactions/transaction-database.js";
import { createAgentService, createRootAgentService } from "./index.js";

// AI agent services. Each observes the game and plays through its transactions, so
// it is built from the database rather than injected.
const serviceDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  services: {
    agent: createRootAgentService,
    agentX: (db) => createAgentService(db, "X"),
    agentO: (db) => createAgentService(db, "O"),
  },
});

export type ServiceDatabase = Database.Plugin.ToDatabase<typeof serviceDatabasePlugin>;

export namespace ServiceDatabase {
  export const plugin = serviceDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof serviceDatabasePlugin>;
}
