// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "../transactions/transaction-database.js";
import { GameService } from "../../services/game-service/game-service.js";
import { createConnectionService } from "./index.js";

// `game` has no default (its factory throws), so the app injects it. `connection`
// is built from it in a second step, because a service factory sees only the
// services of the plugins it extends.
const gameDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  services: {
    game: GameService.create,
  },
});

const serviceDatabasePlugin = Database.Plugin.create({
  extends: gameDatabasePlugin,
  services: {
    connection: (db) => createConnectionService(db, db.services.game),
  },
});

export type ServiceDatabase = Database.Plugin.ToDatabase<
  typeof serviceDatabasePlugin
>;

export namespace ServiceDatabase {
  export const plugin = serviceDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof serviceDatabasePlugin>;
}
