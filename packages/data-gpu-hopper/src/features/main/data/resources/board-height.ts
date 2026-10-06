// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";

// Board height in rows.
export const boardHeight = { type: "integer", minimum: 1, default: 9, ...Scope.session } as const satisfies ResourceSchema;
