// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from '@adobe/ecs';

/** How many sprites there are, and how many frames have been drawn. */
export const stats = Symbol();

declare module '@adobe/ecs' {
    interface Resources {
        [stats]: { type: { readonly sprites: U32; readonly frames: U32 }; default: { sprites: 0; frames: 0 } };
    }
}
