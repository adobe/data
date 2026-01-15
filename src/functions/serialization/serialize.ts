// © 2026 Adobe. MIT License. See /LICENSE for details.
import { findCodec, EncodedValue, getCodec, isEncodedValue } from "./codec.js";

export function serialize<T>(data: T): { json: string, binary: Uint8Array[] } {
    const allBinaries: Uint8Array[] = [];
    const json = JSON.stringify(data, (_key, value) => {
        const codec = findCodec(value);
        if (codec) {
            const { json, binary } = codec.serialize(value);
            const binaryIndex = allBinaries.length;
            if (binary) {
                allBinaries.push(...binary);
            }
            return { codec: codec.name, json, binaryIndex, binaryCount: binary?.length ?? 0 } satisfies EncodedValue;
        }
        return value;
    });
    return { json, binary: allBinaries };
}

export function deserialize<T>(payload: { json: string, binary: Uint8Array[] }): T {
    const data = JSON.parse(payload.json, (_key, value) => {
        if (isEncodedValue(value)) {
            const codec = getCodec(value.codec);
            if (codec) {
                const binary = payload.binary.slice(value.binaryIndex, value.binaryIndex + value.binaryCount);
                return codec.deserialize({ json: value.json, binary });
            }
        }
        return value;
    });
    return data as T;
}