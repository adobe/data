// © 2026 Adobe. MIT License. See /LICENSE for details.
import { toArrayBufferBacked } from "../../internal/array-buffer-like/index.js";
import { compressDeflate, decompressDeflate } from "./compression.js";
import { serialize, deserialize } from "./serialize.js";

const ENCODING_VERSION = 2;

const concatenateBuffers = (parts: Uint8Array<ArrayBuffer>[]): Uint8Array => {
    const totalSize = parts.reduce((sum, p) => sum + p.byteLength, 0);
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const part of parts) {
        combined.set(part, offset);
        offset += part.byteLength;
    }
    return combined;
};

export const serializeToBlobs = async <T>(data: T): Promise<{ json: Blob, binary: Blob }> => {
    const serialized = serialize(data);
    const binarySizes = serialized.binary.map((array) => array.byteLength);
    const binaryParts = serialized.binary.map(toArrayBufferBacked);

    const compressed = await compressDeflate(concatenateBuffers(binaryParts));

    const json = new Blob(
        [JSON.stringify({ version: ENCODING_VERSION, json: serialized.json, binarySizes })],
        { type: "application/json" }
    );
    const binary = new Blob([compressed], { type: "application/octet-stream" });
    return { json, binary };
};

export const deserializeFromBlobs = async <T>({ json, binary }: { json: Blob, binary: Blob }): Promise<T> => {
    const jsonText = await json.text();
    const { version, json: serializedJson, binarySizes } = JSON.parse(jsonText);

    const raw = new Uint8Array(await binary.arrayBuffer());
    const binaryArray = version >= 2
        ? await decompressDeflate(raw)
        : toArrayBufferBacked(raw);

    const binaryChunks: Uint8Array<ArrayBuffer>[] = [];
    let offset = 0;

    for (const size of binarySizes) {
        binaryChunks.push(binaryArray.slice(offset, offset + size));
        offset += size;
    }

    return deserialize<T>({ json: serializedJson, binary: binaryChunks });
};
