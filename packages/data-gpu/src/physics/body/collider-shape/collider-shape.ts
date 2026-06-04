// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

/**
 * Collider geometry. `halfExtents` carries the dimensions:
 *   box     — all three axes (half-extents).
 *   sphere  — `.x` is the radius.
 *   capsule — `.x` is the radius, `.y` the cylinder's half-height; Y-aligned
 *             (total height 2·(y + x)). `.z` unused.
 * (Convex hulls + meshes land later.)
 */
export type ColliderShape = Schema.ToType<typeof schema>;

export * as ColliderShape from "./public.js";
