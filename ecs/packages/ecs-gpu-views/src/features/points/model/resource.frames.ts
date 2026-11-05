// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Frames the world drew. */
export const frames = Symbol();

declare module '@adobe/ecs' {
    interface Resources {
        [frames]: { type: number };
    }
}
