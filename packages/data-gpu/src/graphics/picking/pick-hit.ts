// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";

/**
 * One ray-pick result — the Model the ray hit and the parametric distance
 * along the ray segment (`alpha ∈ [0,1]` where 0 is the ray's near point
 * `a` and 1 is the far point `b` from `screenToWorldRay`).
 */
export interface PickHit {
    readonly entity: Entity;
    readonly distance: number;
}
