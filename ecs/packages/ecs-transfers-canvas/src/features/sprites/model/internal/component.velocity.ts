// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from '@adobe/ecs';

/** How fast a sprite moves, in pixels per second. */
export const velocity = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [velocity]: { type: Vec2 };
    }
}
