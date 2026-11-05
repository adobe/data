// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from '@adobe/ecs';

/** How many particles are spawned. */
export const count = Symbol();

declare module '@adobe/ecs' {
    interface Resources {
        [count]: { type: U32; default: 100 };
    }
}
