// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { AgenticService } from "@adobe/data/service";
import { ComputedDatabase } from "../computed-database/computed-database.js";
import { OpponentService } from "../../opponent-service/opponent-service.js";
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
    // The move-selection capability contract (async port, no ECS state to bind)
    // registered directly from its `services/` factory — like data-lit-todo's
    // nameGenerator. Its deterministic double (`OpponentService.createFake`) is
    // what unit tests inject; production selects a legal move here.
    opponent: OpponentService.create,
  },
});

export type ServiceDatabase = Database.Plugin.ToDatabase<
  typeof serviceDatabasePlugin
>;

export namespace ServiceDatabase {
  export const plugin = serviceDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof serviceDatabasePlugin>;
}
