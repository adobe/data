// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "@adobe/ecs";

/** `VelocityComponent`, the suite's component two. */
export const velocity = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [velocity]: { type: { readonly x: F32; readonly y: F32 } };
    }
}
