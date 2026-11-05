// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from '@adobe/ecs';

export const position = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [position]: { type: Vec3 };
    }
}
