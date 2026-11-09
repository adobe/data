// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32, U32 } from "@adobe/ecs";

/** `HealthComponent`, its `status` a `statusEffect`. */
export const health = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [health]: { type: { readonly hp: I32; readonly maxhp: I32; readonly status: U32 } };
    }
}
