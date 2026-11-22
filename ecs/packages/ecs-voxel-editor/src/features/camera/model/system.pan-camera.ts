// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, Vec3 } from "@adobe/ecs";
import { fieldOfView } from "./constant.field-of-view.js";
import { basisOf } from "./function.basis-of.js";
import { camera } from "./resource.camera.js";

/**
 * Moves the camera and its target across the view, so what's at the target follows a pointer moved `dx` and `dy`, as
 * fractions of the view's height, right and down.
 */
export const panCamera: System<{ readonly dx: number; readonly dy: number }> = System.create({}, ({ resources }, input: { readonly dx: number; readonly dy: number }) => {
    const current = resources[camera];
    const { right, up } = basisOf(current);
    const height = 2 * current.distance * Math.tan(fieldOfView / 2);
    const moved = Vec3.add(Vec3.scale(right, -input.dx * height), Vec3.scale(up, input.dy * height));
    resources[camera] = { ...current, target: Vec3.add(current.target, moved) };
});
