// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { AgenticService } from "@adobe/data/service";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import {
  createAgentService,
  createRootAgentService,
} from "./services/index.js";

const serviceDatabasePlugin = Database.Plugin.create({
  extends: ComputedDatabase.plugin,
  services: {
    agent: (db): AgenticService => createRootAgentService(db),
    agentX: (db): AgenticService => createAgentService(db, "X"),
    agentO: (db): AgenticService => createAgentService(db, "O"),
  },
});

export type ServiceDatabase = Database.Plugin.ToDatabase<
  typeof serviceDatabasePlugin
>;

export namespace ServiceDatabase {
  export const plugin = serviceDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof serviceDatabasePlugin>;
}
