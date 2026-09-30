// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";

// Points scored this game. Session scope.
export const score = { ...F32.schema, ...Scope.session } satisfies ResourceSchema;
