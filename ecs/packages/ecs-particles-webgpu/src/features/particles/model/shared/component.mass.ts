// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from '@adobe/ecs';

export const mass = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [mass]: { type: F32 };
    }
}
