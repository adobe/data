// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Quat, Vec3 } from "@adobe/ecs";
import type { Camera } from "./type.camera.js";

/** A camera's eye and axes: its own `x`, `y` and `-z`, turned by its rotation. */
export const basisOf = (camera: Camera): Basis => {
    const { target, rotation, distance } = camera;
    const back = Quat.rotateVec3(rotation, [0, 0, 1]);
    return {
        eye: Vec3.add(target, Vec3.scale(back, distance)),
        forward: Vec3.negate(back),
        right: Quat.rotateVec3(rotation, [1, 0, 0]),
        up: Quat.rotateVec3(rotation, [0, 1, 0]),
    };
};

/** Where a camera is and its axes, each of unit length: it looks along `forward`, with `right` and `up` across its view. */
type Basis = {
    readonly eye: Vec3;
    readonly forward: Vec3;
    readonly right: Vec3;
    readonly up: Vec3;
};
