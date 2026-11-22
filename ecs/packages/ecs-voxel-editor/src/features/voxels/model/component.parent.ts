// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/** The model a voxel, instance or selected face is in: it's despawned with it. */
export const parent = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [parent]: { type: Entity; reference: "owner" };
    }
}
