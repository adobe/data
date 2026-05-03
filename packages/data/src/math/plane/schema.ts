// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { Vec3 } from "../vec3/index.js";
import { F32 } from "../f32/index.js";

export const schema = {
    type: 'object',
    properties: {
        normal: Vec3.schema,
        distance: F32.schema,
    },
    required: ['normal', 'distance'],
    additionalProperties: false,
} as const satisfies Schema;

