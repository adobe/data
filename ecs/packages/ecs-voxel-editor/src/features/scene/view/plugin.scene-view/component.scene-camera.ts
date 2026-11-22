// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Marks the view the scene is drawn into, which the camera aims. */
export const sceneCamera = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [sceneCamera]: { type: true };
    }
}
