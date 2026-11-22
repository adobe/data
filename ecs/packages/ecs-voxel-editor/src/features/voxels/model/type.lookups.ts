// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, Quat, Vec3 } from "@adobe/ecs";

/** How the transform functions find models and instances, as a system's lookups give them, null for none. */
export type Lookups = {
    readonly model: (entity: Entity) => { readonly size: Vec3; readonly scale: Vec3 } | null;
    readonly instance: (entity: Entity) => { readonly of: Entity; readonly parent: Entity; readonly position: Vec3; readonly rotation: Quat } | null;
};
