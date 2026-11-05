// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A particle that shows. */
export const visible = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [visible]: { type: true };
    }
}
