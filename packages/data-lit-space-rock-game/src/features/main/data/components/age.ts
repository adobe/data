// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { Schema } from "@adobe/data/schema";
import { F32 } from "@adobe/data/math";

// Seconds a bullet has been alive. Session scope: the game is client-local and ephemeral.
export const age = { ...F32.schema, ...Scope.session } satisfies Schema;
