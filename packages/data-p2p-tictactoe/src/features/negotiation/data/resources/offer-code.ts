// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";

// The host's generated invite code.
export const offerCode = { type: "string", default: "", ...Scope.session } as const satisfies ResourceSchema;
