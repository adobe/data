// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The page's element an app is mounted in: views' systems find their elements within it, and their plugins listen
 * there for its elements' events. Null until the app provides it.
 */
export const root = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [root]: { type: HTMLElement | null; thread: "main" };
    }
    interface PluginConfig {
        [root]: HTMLElement;
    }
}
