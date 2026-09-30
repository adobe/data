// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ResourceSchema } from "@adobe/data/ecs";

// The counter value. Document scope.
export const count = { type: "number", default: 0 } as const satisfies ResourceSchema;
