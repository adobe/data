// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "../vec3/index.js";
import type { Aabb } from "./index.js";

export const center = (aabb: Aabb): Vec3 => [
    (aabb.min[0] + aabb.max[0]) / 2,
    (aabb.min[1] + aabb.max[1]) / 2,
    (aabb.min[2] + aabb.max[2]) / 2,
];
