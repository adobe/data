// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 } from "@adobe/ecs";

/** `DamageComponent`. */
export const damage = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [damage]: { type: { readonly atk: I32; readonly def: I32 } };
    }
}
