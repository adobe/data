// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Mat4x4, type Vec3 } from "@adobe/ecs";
import { fieldOfView } from "../constant.field-of-view.js";
import type { Camera } from "../type.camera.js";

/** The camera aimed at the center of a model `size` voxels across, drawn through `toWorld`, from far enough away to see all of it. */
export const framing = (camera: Camera, frame: { readonly size: Vec3; readonly toWorld: Mat4x4 }): Camera => {
    const corners: Vec3[] = [];
    for (let i = 0; i < 8; i++) {
        const [x, y, z] = Mat4x4.multiplyVec4(frame.toWorld, [i & 1 ? frame.size[0] : 0, i & 2 ? frame.size[1] : 0, i & 4 ? frame.size[2] : 0, 1]);
        corners.push([x, y, z]);
    }
    const mean = (axis: number): number => corners.reduce((sum, corner) => sum + corner[axis], 0) / 8;
    const center: Vec3 = [mean(0), mean(1), mean(2)];
    const radius = Math.max(...corners.map(corner => Math.hypot(corner[0] - center[0], corner[1] - center[1], corner[2] - center[2])));
    return { ...camera, target: center, distance: radius / Math.sin(fieldOfView / 2) };
};
