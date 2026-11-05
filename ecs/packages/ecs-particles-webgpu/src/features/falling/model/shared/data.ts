// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32, Vec3 } from '@adobe/ecs';

export const position = Symbol();
export const velocity = Symbol();
/** The seconds a frame moves particles by. */
export const delta = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
    }
    interface Resources {
        [delta]: { type: F32; default: 0 };
    }
}
