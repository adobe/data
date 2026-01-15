// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Data } from "../../data.js";
import { registerTypedBufferCodecs } from "../../typed-buffer/register-typed-buffer-codecs.js";
import { registerTypedArrayCodecs } from "./register-typed-array-codecs.js";

type Codec<T> = {
    name: string;
    predicate: (data: any) => data is T;
    serialize: (data: T) => { json?: any, binary?: Uint8Array[] };
    deserialize: (props: { json?: any, binary: Uint8Array[] }) => T;
}
const codecs: Record<string, Codec<any>> = {};

export function findCodec(data: any): Codec<any> | null {
    if (typeof data === "object" && data !== null) {
        for (const codec of Object.values(codecs)) {
            if (codec.predicate(data)) {
                return codec;
            }
        }
    }
    return null;
}
export function getCodec(name: string): Codec<any> | null {
    return codecs[name] ?? null;
}

export type EncodedValue = {
    codec: string;
    json?: Data;
    binaryIndex: number;
    binaryCount: number;
}

export function isEncodedValue(value: unknown): value is EncodedValue {
    return typeof value === "object" && value !== null && "codec" in value && "binaryIndex" in value && "binaryCount" in value;
}

export function registerCodec<T>(codec: Codec<T>) {
    if (codecs[codec.name]) throw new Error(`codec "${codec.name}" already registered`);
    codecs[codec.name] = codec;
}

registerTypedArrayCodecs();
registerTypedBufferCodecs();
