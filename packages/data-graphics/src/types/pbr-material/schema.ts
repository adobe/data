// © 2026 Adobe. MIT License. See /LICENSE for details.

import { F32, Vec3, Vec4 } from "@adobe/data/math";
import { Schema } from "@adobe/data/schema";

export const schema = {
    type: "object",
    properties: {
        baseColorFactor: Vec4.schema,
        emissiveFactor: Vec3.schema,
        metallicFactor: F32.schema,
        roughnessFactor: F32.schema,
        normalScale: F32.schema,
        occlusionStrength: F32.schema,
    },
    required: [
        "baseColorFactor",
        "emissiveFactor",
        "metallicFactor",
        "roughnessFactor",
        "normalScale",
        "occlusionStrength",
    ],
    additionalProperties: false,
} as const satisfies Schema;
