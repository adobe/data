// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from '@adobe/ecs';

/** A particle's color: RGBA bytes, red lowest. */
export const color = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [color]: { type: U32 };
    }
}
