// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Mat4x4, type Vec3 } from "@adobe/ecs";

/** A world ray in the voxels of a model `toWorld` takes to the world: its `t` measures the same points. */
export const rayInto = (ray: { readonly origin: Vec3; readonly direction: Vec3 }, toWorld: Mat4x4): { readonly origin: Vec3; readonly direction: Vec3 } => {
    const fromWorld = Mat4x4.inverse(toWorld);
    const [ox, oy, oz, ow] = Mat4x4.multiplyVec4(fromWorld, [ray.origin[0], ray.origin[1], ray.origin[2], 1]);
    const [dx, dy, dz] = Mat4x4.multiplyVec4(fromWorld, [ray.direction[0], ray.direction[1], ray.direction[2], 0]);
    return { origin: [ox / ow, oy / ow, oz / ow], direction: [dx, dy, dz] };
};
