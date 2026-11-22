// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "@adobe/ecs";

/** How metallic a material looks, from 0 to 1. */
export const metallic = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [metallic]: { type: F32 };
    }
}
