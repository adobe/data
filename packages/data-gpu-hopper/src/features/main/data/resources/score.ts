// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";

export const score = { type: "integer", minimum: 0, default: 0, ...Scope.session } as const satisfies ResourceSchema;
