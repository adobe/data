// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from '@adobe/ecs';

/** Where a point is. */
export const place = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [place]: { type: Vec3 };
    }
}
