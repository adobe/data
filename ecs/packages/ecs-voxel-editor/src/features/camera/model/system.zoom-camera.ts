// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { camera } from "./resource.camera.js";

/** Moves the camera toward its target, to `factor` times its distance: below 1 zooms in. */
export const zoomCamera: System<{ readonly factor: number }> = System.create({}, ({ resources }, input: { readonly factor: number }) => {
    const current = resources[camera];
    const distance = Math.min(Math.max(current.distance * input.factor, 0.5), 5000);
    resources[camera] = { ...current, distance };
});
