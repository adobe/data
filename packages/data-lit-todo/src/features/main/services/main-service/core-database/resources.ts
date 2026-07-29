// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Boolean } from "@adobe/data/schema";

export const resources = Database.resources({
  settings: {
    displayCompleted: Boolean.schema, // per-device view toggle; durable, not shared
  },
});
