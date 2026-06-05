// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

/**
 * How a joint constrains the two bodies it connects:
 *   fixed — rigidly locks them together (no relative motion).
 *   point — a ball/spherical joint: anchors coincide, free rotation (chains, ragdoll joints).
 *   hinge — a revolute joint: 1 rotational DOF about an axis, with optional angle limits (doors, elbows).
 */
export type JointType = Schema.ToType<typeof schema>;

export * as JointType from "./public.js";
