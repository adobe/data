// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { Schema } from "@adobe/data/schema";
import { Vec2 } from "@adobe/data/math";

// Constant drift of a bullet or asteroid, pixels per second. Session scope: the game is client-local and ephemeral.
export const velocity = { ...Vec2.schema, ...Scope.session } satisfies Schema;
