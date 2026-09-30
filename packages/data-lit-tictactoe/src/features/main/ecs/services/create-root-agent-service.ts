// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AgenticService } from "@adobe/data/service";
import type { ComputedDatabase } from "../computed/computed-database.js";
import { createAgentService } from "./create-agent-service.js";

// Root agent linking to one agent per mark, so a supervising agent picks a side.
export const createRootAgentService = (db: ComputedDatabase): AgenticService =>
  AgenticService.create({
    interface: {
      x: { type: "link", description: "Play as X" },
      o: { type: "link", description: "Play as O" },
    },
    implementation: {
      x: createAgentService(db, "X"),
      o: createAgentService(db, "O"),
    },
  });
