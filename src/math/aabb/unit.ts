// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Aabb } from "./index.js";

/**
 * A unit AABB is a cube with side length 1 centered at the origin.
 */
export const unit: Aabb = {
    min: [-0.5, -0.5, -0.5],
    max: [0.5, 0.5, 0.5],
};
