// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/**
 * The paint covering a voxel's `paintedFaces`, one for all of them: its own `material` until a face is painted, and
 * again once none is.
 */
export const paint = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [paint]: { type: Entity; reference: "owner" };
    }
}
