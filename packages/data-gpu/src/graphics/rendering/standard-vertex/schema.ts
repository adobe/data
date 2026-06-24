// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Vec2, Vec3, Vec4 } from "@adobe/data/math";
import { Schema } from "@adobe/data/schema";

export const schema = {
    type: "object",
    properties: {
        position: Vec3.schema,
        normal: Vec3.schema,
        tangent: Vec4.schema,
        uv: Vec2.schema,
    },
    required: ["position", "normal", "tangent", "uv"],
    additionalProperties: false,
    layout: "packed",
} as const satisfies Schema;
