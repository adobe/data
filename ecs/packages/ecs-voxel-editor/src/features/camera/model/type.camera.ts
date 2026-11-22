// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32, Quat, Vec3 } from "@adobe/ecs";

/**
 * An orbit camera: it looks at `target` from `distance` away, turned by `rotation`, which takes the camera's axes to the
 * world's: unturned, it looks along `-z` with `y` up, from `+z`.
 */
export type Camera = {
    readonly target: Vec3;
    readonly rotation: Quat;
    readonly distance: F32;
};
