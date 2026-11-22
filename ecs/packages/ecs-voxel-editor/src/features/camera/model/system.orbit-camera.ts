// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Quat, System } from "@adobe/ecs";
import { camera } from "./resource.camera.js";

/**
 * Orbits the camera about its target, freely, as a trackball does: `dx` turns it about its own up axis and `dy` about
 * its own right axis, in radians, so it rolls over the top and on round without stopping or flipping.
 */
export const orbitCamera: System<{ readonly dx: number; readonly dy: number }> = System.create({}, ({ resources }, input: { readonly dx: number; readonly dy: number }) => {
    const current = resources[camera];
    const turned = Quat.multiply(Quat.multiply(current.rotation, Quat.fromAxisAngle([0, 1, 0], -input.dx)), Quat.fromAxisAngle([1, 0, 0], -input.dy));
    resources[camera] = { ...current, rotation: Quat.normalize(turned) };
});
