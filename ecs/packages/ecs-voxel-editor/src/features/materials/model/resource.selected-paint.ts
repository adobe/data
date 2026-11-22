// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/** The paint painting coats voxels with: none until one is chosen. */
export const selectedPaint = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [selectedPaint]: { type: Entity };
    }
}
