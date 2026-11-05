// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A sprite's decoded texture, moved to the world's thread, where sprites are drawn. */
export const texture = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [texture]: { type: ImageBitmap; transfer: true };
    }
}
