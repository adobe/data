// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Material } from "./material.js";

/**
 * Stable material order. The index into this array is what a body stores on the
 * GPU and what indexes the material-properties buffer — do not reorder without
 * rebuilding that buffer.
 */
export const list: readonly Material[] = ["rubber", "wood", "stone", "steel", "ice"];
