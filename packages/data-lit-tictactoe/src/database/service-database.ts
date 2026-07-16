// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { AgenticService } from "@adobe/data/service";
import { TictactoeDatabase } from "./tictactoe-database.js";
import {
  createAgentService,
  createRootAgentService,
} from "./services/index.js";

const agentDatabasePlugin = Database.Plugin.create({
  extends: TictactoeDatabase.plugin,
  services: {
    agent: (db): AgenticService => createRootAgentService(db),
    agentX: (db): AgenticService => createAgentService(db, "X"),
    agentO: (db): AgenticService => createAgentService(db, "O"),
  },
});

export type AgentDatabase = Database.Plugin.ToDatabase<
  typeof agentDatabasePlugin
>;

export namespace AgentDatabase {
  export const plugin = agentDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof agentDatabasePlugin>;
}
