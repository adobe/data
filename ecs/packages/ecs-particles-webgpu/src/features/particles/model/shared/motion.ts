// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32, Vec3 } from '@adobe/ecs';

/** How far a particle moves each frame, in pixels. */
export const velocity = Symbol();
export const mass = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [velocity]: { type: Vec3 };
        [mass]: { type: F32 };
    }
}
