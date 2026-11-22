// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Quat, System } from "@adobe/ecs";
import { camera } from "./resource.camera.js";

/**
 * Turns the camera about its target as a turntable does, keeping a level view level: `dx` turns it about the world's up
 * axis and `dy` pitches it about its own right axis, in radians.
 */
export const turnCamera: System<{ readonly dx: number; readonly dy: number }> = System.create({}, ({ resources }, input: { readonly dx: number; readonly dy: number }) => {
    const current = resources[camera];
    const turned = Quat.multiply(Quat.multiply(Quat.fromAxisAngle([0, 1, 0], -input.dx), current.rotation), Quat.fromAxisAngle([1, 0, 0], -input.dy));
    resources[camera] = { ...current, rotation: Quat.normalize(turned) };
});
