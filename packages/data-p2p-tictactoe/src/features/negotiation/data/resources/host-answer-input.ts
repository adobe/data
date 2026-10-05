// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";

// Live value of the host's "paste answer" textarea.
export const hostAnswerInput = { type: "string", default: "", ...Scope.session } as const satisfies ResourceSchema;
