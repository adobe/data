// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from '@adobe/ecs';

/** How far a particle moves each frame, in pixels. */
export const velocity = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [velocity]: { type: Vec3 };
    }
}
