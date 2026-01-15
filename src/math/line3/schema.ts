// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { Vec3 } from "../vec3/index.js";

const { schema: Vec3Schema } = Vec3;

export const schema = {
    type: 'object',
    properties: {
        a: Vec3Schema,
        b: Vec3Schema,
    },
    required: ['a', 'b'],
    additionalProperties: false,
    default: {
        a: Vec3Schema.default,
        b: Vec3Schema.default,
    }
} as const satisfies Schema;

