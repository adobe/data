// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ResourceSchema } from "@adobe/data/ecs";

// The active user's display name. Document scope.
export const userName = { type: "string", default: "Guest" } as const satisfies ResourceSchema;
