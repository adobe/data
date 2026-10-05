// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";

// Seconds the next tick advances. The render loop feeds it from the frame clock; headless
// hosts set it directly. Implementation-only (no spec analogue).
export const frameDelta = { type: "number", default: 1 / 60, ...Scope.session } as const satisfies ResourceSchema;
