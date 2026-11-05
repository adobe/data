// © 2026 Adobe. MIT License. See /LICENSE for details.

/** The canvas main moved to the world's thread, null until it's attached. */
export const surface = Symbol();

declare module '@adobe/ecs' {
    interface Resources {
        [surface]: { type: OffscreenCanvas | null; transfer: true };
    }
}
