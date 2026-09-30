// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";

// The joiner's generated answer code.
export const answerCode = { type: "string", default: "", ...Scope.session } as const satisfies ResourceSchema;
