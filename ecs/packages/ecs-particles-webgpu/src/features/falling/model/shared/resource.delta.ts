// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from '@adobe/ecs';

/** The seconds a frame moves particles by. */
export const delta = Symbol();

declare module '@adobe/ecs' {
    interface Resources {
        [delta]: { type: F32; default: 0 };
    }
}
