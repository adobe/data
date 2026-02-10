// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { schema } from "./schema.js";

export type Mat4x4 = Schema.ToType<typeof schema>;

/**
 * 4x4 Matrix operations using column-major order (WebGPU standard).
 * 
 * Matrix Layout:
 * Matrices are stored in column-major order as flat arrays of 16 elements.
 * This matches WebGPU's memory layout and shader expectations.
 * 
 * Layout: [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15]
 * 
 * Which represents:
 * ┌                    ┐
 * │ m0  m4  m8   m12  │  (Column 0, 1, 2, 3)
 * │ m1  m5  m9   m13  │
 * │ m2  m6  m10  m14  │
 * │ m3  m7  m11  m15  │
 * └                    ┘
 * 
 * For transformation matrices (position, rotation, scale):
 * - Columns 0-2 (m0-m2, m4-m6, m8-m10): Rotation/scale basis vectors (right, up, forward)
 * - Column 3 (m12, m13, m14): Translation (x, y, z)
 * - Row 3 (m3, m7, m11, m15): Perspective (usually 0, 0, 0, 1)
 */
export * as Mat4x4 from "./public.js";
