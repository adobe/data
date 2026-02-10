// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import { Vec2 } from "../vec2/index.js";

const { schema: Vec2Schema } = Vec2;

export const schema = {
    type: 'object',
    properties: {
        a: Vec2Schema,
        b: Vec2Schema,
    },
    required: ['a', 'b'],
    additionalProperties: false,
    default: {
        a: Vec2Schema.default,
        b: Vec2Schema.default,
    }
} as const satisfies Schema;

