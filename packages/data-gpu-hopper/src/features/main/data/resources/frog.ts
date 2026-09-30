// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Frog } from "../values/frog/frog.js";

// The single frog, a singleton position.
export const frog = { ...Frog.schema, default: { x: 0, y: 0 }, ...Scope.session } as const satisfies ResourceSchema;
