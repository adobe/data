// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { Schema } from "@adobe/data/schema";
import { DragPosition } from "../values/drag-position/drag-position.js";

// Live drag offset: session scope (not saved, not shared). Implementation-only.
export const dragPosition = { ...DragPosition.schema, ...Scope.session } satisfies Schema;
