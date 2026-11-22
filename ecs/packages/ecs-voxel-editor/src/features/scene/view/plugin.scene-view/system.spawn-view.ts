// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Mat4x4, System } from "@adobe/ecs";
import { View } from "@adobe/ecs-gpu";
import { sceneCamera } from "./component.scene-camera.js";

/** The view of the whole of `surface` the scene is drawn into, which `aimView` aims through the camera. */
export const spawnView: System<{ readonly surface: Entity }> = System.create({}, ({ commands }, input: { readonly surface: Entity }) => {
    commands.spawn([View.target, View.viewport, View.projection, sceneCamera])({
        [View.target]: input.surface, [View.viewport]: [0, 0, 1, 1], [View.projection]: Mat4x4.identity, [sceneCamera]: true,
    });
});
