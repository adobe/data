// © 2026 Adobe. MIT License. See /LICENSE for details.

import { F32, Vec3 } from "@adobe/data/math";
import { Schema } from "@adobe/data/schema";

export const schema = {
    type: "object",
    properties: {
        aspect: F32.schema,
        fieldOfView: F32.schema,
        nearPlane: F32.schema,
        farPlane: F32.schema,
        position: Vec3.schema,
        target: Vec3.schema,
        up: Vec3.schema,
        // 0 = perspective, 1 = orthographic, fractional = hybrid blend
        orthographic: F32.schema,
    },
    required: ["aspect", "fieldOfView", "nearPlane", "farPlane", "position", "target", "up", "orthographic"],
    additionalProperties: false,
} as const satisfies Schema;
