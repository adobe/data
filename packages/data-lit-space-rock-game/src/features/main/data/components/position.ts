// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { Schema } from "@adobe/data/schema";
import { Vec2 } from "@adobe/data/math";

// Where a bullet or asteroid is. Session scope: the game is client-local and ephemeral.
export const position = { ...Vec2.schema, ...Scope.session } satisfies Schema;
