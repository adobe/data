// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Entity, Mat4x4, System } from '@adobe/ecs';
import { View } from '@adobe/ecs-gpu';
import { camera } from './shared/camera.js';

/** Two views side by side on the main surface, and one from above on the map's. */
export const spawnViews: System<{ readonly main: Entity; readonly map: Entity }> = System.create({}, ({ commands }, input: { readonly main: Entity; readonly map: Entity }) => {
    const views = [[input.main, [0, 0, 0.5, 1], "orbit"], [input.main, [0.5, 0, 0.5, 1], "side"], [input.map, [0, 0, 1, 1], "above"]] as const;
    for (const [surface, viewport, looking] of views) {
        commands.spawn([View.target, View.viewport, View.projection, camera])({ [View.target]: surface, [View.viewport]: viewport, [View.projection]: Mat4x4.identity, [camera]: looking });
    }
});
