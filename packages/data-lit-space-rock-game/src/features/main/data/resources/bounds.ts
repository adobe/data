// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Vec2 } from "@adobe/data/math";

// Play-field size [width, height]; entities wrap within it. Session scope.
export const bounds = { ...Vec2.schema, ...Scope.session } satisfies ResourceSchema;
