// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A particle that moves. */
export const enabled = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [enabled]: { type: true };
    }
}
