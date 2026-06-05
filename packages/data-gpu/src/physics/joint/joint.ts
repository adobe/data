// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import type { Vec3 } from "@adobe/data/math";
import type { JointType } from "./joint-type/joint-type.js";

/**
 * One row of the `Joint` archetype — a constraint between two bodies, solved by
 * whichever physics solver is active. Anchors are in each body's local frame;
 * at rest the two anchor points coincide in world space (the joint location).
 *
 * `jointAxis` is the hinge axis (body-A local) for `hinge`, ignored otherwise.
 * `jointMinLimit`/`jointMaxLimit` bound the hinge angle (radians); a range where
 * `min >= max` means "no limit" (free hinge).
 */
export interface Joint {
    jointType: JointType;
    jointBodyA: Entity;
    jointBodyB: Entity;
    jointAnchorA: Vec3;
    jointAnchorB: Vec3;
    jointAxis: Vec3;
    jointMinLimit: number;
    jointMaxLimit: number;
}
