// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/** The material new voxels are filled with: none until one is chosen. */
export const selectedMaterial = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [selectedMaterial]: { type: Entity };
    }
}
