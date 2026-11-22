// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec3 } from "@adobe/ecs";
import { fieldOfView } from "./constant.field-of-view.js";
import { basisOf } from "./function.basis-of.js";
import type { Camera } from "./type.camera.js";
import type { Ray } from "./type.ray.js";

/**
 * The ray from a camera's eye through a point of its view, `x` and `y` from -1 to 1 across it, left to right and bottom to
 * top, for a view `aspect` times as wide as it's tall.
 */
export const rayThrough = (camera: Camera, x: number, y: number, aspect: number): Ray => {
    const { eye, forward, right, up } = basisOf(camera);
    const half = Math.tan(fieldOfView / 2);
    const across = Vec3.add(Vec3.scale(right, x * half * aspect), Vec3.scale(up, y * half));
    return { origin: eye, direction: Vec3.normalize(Vec3.add(forward, across)) };
};
