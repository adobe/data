// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ColliderShape } from "./collider-shape.js";

/** The solver's numeric shape id (sphere = 0, box = 1, capsule = 2). */
export function toIndex(shape: ColliderShape): number {
    return shape === "box" ? 1 : shape === "capsule" ? 2 : 0;
}
