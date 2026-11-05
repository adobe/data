// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from '@adobe/ecs';

/** A point's hue, from 0 to 1. */
export const hue = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [hue]: { type: F32 };
    }
}
