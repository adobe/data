// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { Vec3 } from "../index.js";

export const schema = {
    type: 'object',
    properties: {
        min: Vec3.schema,
        max: Vec3.schema,
    },
    required: ['min', 'max'],
    additionalProperties: false,
    default: {
        min: Vec3.schema.default,
        max: Vec3.schema.default,
    }
} as const satisfies Schema;

