// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";

export const lives = { type: "integer", minimum: 0, default: 3, ...Scope.session } as const satisfies ResourceSchema;
