// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, Mat4x4, Vec3 } from "@adobe/ecs";
import { type Camera, rayThrough } from "../../../camera/model/index.js";
import { castRay, rayInto } from "../../../voxels/model/index.js";
import { filledIn } from "./function.filled-in.js";
import type { Pointer } from "./type.pointer.js";
import type { Face } from "./type.face.js";

/**
 * Picking in the model being edited: the ray through the pointer in its voxels, which cells are filled, and the face the
 * ray reaches first, its walls' included.
 */
export const pick = (camera: Camera, pointer: Pointer, frame: { readonly model: Entity; readonly size: Vec3; readonly toWorld: Mat4x4 }, voxelAt: (model: Entity, cell: Vec3) => boolean) => {
    const ray = rayInto(rayThrough(camera, pointer.x, pointer.y, pointer.aspect), frame.toWorld);
    const filled = filledIn(frame.size, cell => voxelAt(frame.model, cell));
    const reached = castRay(ray, frame.size, filled);
    const hit: Face | null = reached === null ? null : { cell: reached.cell, side: reached.side };
    return { ray, filled, hit };
};
