// © 2026 Adobe. MIT License. See /LICENSE for details.

/** The `PluginConfig` name of the canvas the scene is drawn on, which ports listen on for pointer input. */
export const surface = Symbol();

declare module "@adobe/ecs" {
    interface PluginConfig {
        [surface]: HTMLCanvasElement;
    }
}
