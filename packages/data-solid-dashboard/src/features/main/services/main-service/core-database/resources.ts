// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";

// The whole dashboard is scalar state — three singleton resources, no entities.
// All three are `document` scope (shared + durable, no scope flags), the default
// home for feature state. Each carries the same default as `State.create()`.
export const resources = Database.resources({
  document: {
    count: { type: "number", default: 0 },
    userName: { type: "string", default: "Guest" },
    log: { type: "array", items: { type: "string" }, default: [] },
  },
});
