// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Vec3 } from "@adobe/ecs";
import type { Camera } from "../../camera/model/index.js";
import type { Editing } from "../../voxels/model/index.js";

/**
 * The camera moved with a model's contents shifted `shift` voxels, where the model is the root of what's drawn, which
 * nothing places, so the view stays on what it showed; unmoved otherwise, as its instances move back instead.
 */
export const cameraFollows = (camera: Camera, editing: Editing, model: Entity, shift: Vec3.I32, scale: Vec3): Camera => {
    if (editing.root !== model || (shift[0] === 0 && shift[1] === 0 && shift[2] === 0)) return camera;
    return { ...camera, target: Vec3.add(camera.target, [shift[0] * scale[0], shift[1] * scale[1], shift[2] * scale[2]]) };
};
