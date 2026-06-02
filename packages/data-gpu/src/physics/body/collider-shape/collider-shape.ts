// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

/**
 * Collider geometry. `halfExtents` carries the dimensions: a box uses all three
 * axes; a sphere uses `.x` as its radius. (Convex hulls land later.)
 */
export type ColliderShape = Schema.ToType<typeof schema>;

export * as ColliderShape from "./public.js";
