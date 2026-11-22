// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Quat, System } from "@adobe/ecs";
import { camera } from "./resource.camera.js";

/**
 * Turns the camera to a fixed view about its target, as Blender's numpad views do: turned `yaw` about the world's up
 * axis, `y`, and raised `pitch` above the horizon, level; front is a yaw and pitch of 0.
 */
export const viewCamera: System<{ readonly yaw: number; readonly pitch: number }> = System.create({}, ({ resources }, input: { readonly yaw: number; readonly pitch: number }) => {
    const rotation = Quat.multiply(Quat.fromAxisAngle([0, 1, 0], input.yaw), Quat.fromAxisAngle([1, 0, 0], -input.pitch));
    resources[camera] = { ...resources[camera], rotation };
});
