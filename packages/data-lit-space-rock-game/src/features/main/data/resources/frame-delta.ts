// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { ResourceSchema } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";

// Fixed simulation timestep, seconds per tick. Session scope.
export const frameDelta = { ...F32.schema, default: 1 / 60, ...Scope.session } satisfies ResourceSchema;
