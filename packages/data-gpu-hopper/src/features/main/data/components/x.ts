// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import { F32, type Schema } from "@adobe/data/schema";

// A hazard's left edge, a continuous column.
export const x = { ...F32.schema, ...Scope.session } satisfies Schema;
