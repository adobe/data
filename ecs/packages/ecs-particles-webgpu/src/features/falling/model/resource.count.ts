// © 2026 Adobe. MIT License. See /LICENSE for details.
// component-check: unused-export-ok the falling simulation is a kernel sample that only its test drives; no app runs it.
import type { U32 } from '@adobe/ecs';

/** How many particles are spawned. */
export const count = Symbol();

declare module '@adobe/ecs' {
    interface Resources {
        [count]: { type: U32; default: 100 };
    }
}
