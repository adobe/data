// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat, Vec3 } from "@adobe/data/math";

export interface BoneCapsule {
    jointIndex: number;
    offsetPosition: Vec3;
    offsetRotation: Quat;
    radius: number;
    halfHeight: number;
}
