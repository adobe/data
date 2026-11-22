// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec4 } from "@adobe/ecs";

/** A material's linear RGBA color, each from 0 to 1. */
export const baseColor = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [baseColor]: { type: Vec4 };
    }
}
