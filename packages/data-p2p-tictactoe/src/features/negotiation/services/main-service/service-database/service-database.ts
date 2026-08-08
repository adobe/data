// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "../transaction-database/transaction-database.js";
import { createConnectionService } from "./services/index.js";

const serviceDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  services: {
    connection: (db) => createConnectionService(db),
  },
});

export type ServiceDatabase = Database.Plugin.ToDatabase<
  typeof serviceDatabasePlugin
>;

export namespace ServiceDatabase {
  export const plugin = serviceDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof serviceDatabasePlugin>;
}
