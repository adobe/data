// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

/**
 * How the solver treats a body:
 *   static    — never integrated; an immovable collider (the bulk of a scene).
 *   dynamic   — fully simulated.
 *   kinematic — moved by external code; pushes dynamics but isn't pushed back.
 */
export type BodyType = Schema.ToType<typeof schema>;

export * as BodyType from "./public.js";
