// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from '@adobe/ecs';

/** Where a sprite's top left corner is on the canvas, in pixels. */
export const position = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [position]: { type: Vec2 };
    }
}
