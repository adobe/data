// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "@adobe/ecs";

/** `PositionComponent`, the suite's component one. */
export const position = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: { readonly x: F32; readonly y: F32 } };
    }
}
