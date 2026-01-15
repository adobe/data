// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../schema/index.js";
import { BlobMeta } from "./blob-meta.js";

const BlobHandleSchema = {
    type: 'object',
    properties: {
        ...BlobMeta.schema.properties,
        handle: { type: 'string' },
        expires: { type: 'string' },
        upload: { type: 'boolean' },
        download: { type: 'boolean' },
    },
    required: [...BlobMeta.schema.required, 'handle', 'expires'],
} as const satisfies Schema;

export type BlobHandle = Schema.ToType<typeof BlobHandleSchema>;
export type UploadHandle = BlobHandle & { upload: true };
export type DownloadHandle = BlobHandle & { download: true };
export namespace BlobHandle {
    export const schema = BlobHandleSchema;
    export function is(value: unknown): value is BlobHandle {
        return (
            typeof value === 'object' &&
            value !== null &&
            'handle' in value &&
            'expires' in value &&
            typeof value.handle === 'string' &&
            typeof value.expires === 'string'
        );
    }
    export function isUpload(value: unknown): value is UploadHandle {
        return is(value) && 'upload' in value && value.upload === true;
    }
    export function isDownload(value: unknown): value is DownloadHandle {
        return is(value) && 'download' in value && value.download === true;
    }
}