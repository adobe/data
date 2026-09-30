// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";
import { Boolean } from "@adobe/data/schema";

// Per-device view toggle: settings scope (durable, not shared).
export const displayCompleted = { ...Boolean.schema, ...Scope.settings } satisfies ResourceSchema;
