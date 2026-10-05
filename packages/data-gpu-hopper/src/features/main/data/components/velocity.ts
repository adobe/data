// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import { F32, type Schema } from "@adobe/data/schema";

// A hazard's signed speed in cells/second.
export const velocity = { ...F32.schema, ...Scope.session } satisfies Schema;
