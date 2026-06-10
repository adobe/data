// © 2026 Adobe. MIT License. See /LICENSE for details.

import { F32, Mat4x4, Vec3 } from "@adobe/data/math";
import { Schema } from "@adobe/data/schema";

export const schema = {
    type: "object",
    properties: {
        viewProjectionMatrix: Mat4x4.schema,
        lightDirection: Vec3.schema,
        ambientStrength: F32.schema,
        lightColor: Vec3.schema,
        cameraPosition: Vec3.schema,
    },
    required: ["viewProjectionMatrix", "lightDirection", "ambientStrength", "lightColor", "cameraPosition"],
    additionalProperties: false,
} as const satisfies Schema;
