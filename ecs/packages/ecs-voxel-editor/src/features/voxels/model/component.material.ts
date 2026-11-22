// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/** The material a voxel is filled with: the voxel is despawned with it. */
export const material = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [material]: { type: Entity; reference: "owner" };
    }
}
