// © 2026 Adobe. MIT License. See /LICENSE for details.
import { AgenticService } from "@adobe/data/service";
import type { ComputedDatabase } from "../computed-database.js";
import { createAgentService } from "./create-agent-service.js";

const linkDescriptions = { x: "Play as X", o: "Play as O" } as const;

/**
 * Root agent exposing the two mark-specific agents as links, so a supervising
 * agent can choose which side to drive.
 */
export const createRootAgentService = (
  db: ComputedDatabase,
): AgenticService => {
  const root = AgenticService.create({
    interface: {
      x: { type: "link", description: linkDescriptions.x },
      o: { type: "link", description: linkDescriptions.o },
    },
    implementation: {
      x: createAgentService(db, "X"),
      o: createAgentService(db, "O"),
    },
  });
  return { ...root, linkDescriptions } as AgenticService;
};
