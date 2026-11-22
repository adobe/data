// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "@adobe/ecs";

/** A ray: the points `origin + t * direction` for `t >= 0`, `direction` of unit length. */
export type Ray = {
    readonly origin: Vec3;
    readonly direction: Vec3;
};
