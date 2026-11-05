// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Mat4x4, System } from '@adobe/ecs';
import { View } from '@adobe/ecs-gpu';

/** A view of the whole of `surface`, drawing particles in its pixels. */
export const spawnView: System<{ readonly surface: Entity }> = System.create({}, ({ commands }, input: { readonly surface: Entity }) => {
    commands.spawn([View.target, View.viewport, View.projection])({ [View.target]: input.surface, [View.viewport]: [0, 0, 1, 1], [View.projection]: Mat4x4.identity });
});
