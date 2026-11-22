// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "@adobe/ecs";

/** How rough a material looks, from 0, a mirror, to 1. */
export const roughness = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [roughness]: { type: F32 };
    }
}
