// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../schema/index.js";

const BlobMetaSchema = {
    type: 'object',
    properties: {
        type: { type: 'string' },
        size: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        duration: { type: 'number' },
    },
    required: ['type', 'size'],
} as const satisfies Schema;

export type BlobMeta = Schema.ToType<typeof BlobMetaSchema>;
export namespace BlobMeta {
    export const schema = BlobMetaSchema;
    export function is(value: unknown): value is BlobMeta {
        return (
            typeof value === 'object' &&
            value !== null &&
            'type' in value &&
            'size' in value &&
            typeof value.type === 'string' &&
            typeof value.size === 'number'
        );
    }
}
