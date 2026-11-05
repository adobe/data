// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from '@adobe/ecs';

/** How fast a point turns around the vertical axis, in radians per second. */
export const spin = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [spin]: { type: F32 };
    }
}
