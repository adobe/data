// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";

// Board width in columns. Every hopper resource is session scope.
export const width = { type: "integer", minimum: 1, default: 9, ...Scope.session } as const satisfies ResourceSchema;
