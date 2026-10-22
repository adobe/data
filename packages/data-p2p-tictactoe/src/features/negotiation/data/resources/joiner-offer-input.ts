// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";

// Live value of the joiner's "paste invite" textarea.
export const joinerOfferInput = { type: "string", default: "", ...Scope.session } as const satisfies ResourceSchema;
