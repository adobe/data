// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Lane } from "../values/lane/lane.js";

// The static terrain: one Lane per row.
export const lanes = { type: "array", items: Lane.schema, default: [], ...Scope.session } as const satisfies ResourceSchema;
