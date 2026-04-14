// © 2026 Adobe. MIT License. See /LICENSE for details.

import { toArrayBufferBacked } from "../../internal/array-buffer-like/index.js";
import { compressDeflate, decompressDeflate } from "./compression.js";
import { serialize, deserialize } from "./serialize.js";

/**
 * Internal format with base64-encoded and deflate-compressed binary data
 */
type SerializedJSON = {
    json: unknown; // Parsed JSON object, not a string
    lengths: number[];
    binary: string;
};

/**
 * Converts a Uint8Array to a base64 string
 * Uses chunked processing with String.fromCharCode for optimal performance
 */
const uint8ArrayToBase64 = (data: Uint8Array): string => {
    // Process in 32KB chunks for two reasons:
    // 1. Prevents "Maximum call stack size exceeded" with spread operator on large arrays
    // 2. String.fromCharCode(...chunk) is a single optimized native call per chunk
    const CHUNK_SIZE = 0x8000;
    const chunks: string[] = [];
    
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const end = Math.min(i + CHUNK_SIZE, data.length);
        const chunk = data.subarray(i, end);
        chunks.push(String.fromCharCode(...chunk));
    }
    
    // Modern engines handle array.join() efficiently (no O(n²) with ropes/cons strings)
    return btoa(chunks.join(''));
};

/**
 * Converts a base64 string to a Uint8Array
 */
const base64ToUint8Array = (base64: string): Uint8Array => {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    
    return bytes;
};

/**
 * Serializes data to a single JSON string with base64-encoded and compressed binary data.
 * The binary arrays are concatenated, compressed using deflate, and their original lengths are stored to allow reconstruction.
 */
export const serializeToJSON = async <T>(data: T): Promise<string> => {
    const serialized = serialize(data);
    
    const lengths = serialized.binary.map(chunk => chunk.byteLength);
    
    const totalSize = lengths.reduce((sum, len) => sum + len, 0);
    const combinedBinary = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const binaryChunk of serialized.binary) {
        combinedBinary.set(binaryChunk, offset);
        offset += binaryChunk.byteLength;
    }
    
    const compressedBinary = await compressDeflate(combinedBinary);
    const base64Binary = uint8ArrayToBase64(compressedBinary);
    
    const result: SerializedJSON = {
        json: JSON.parse(serialized.json),
        lengths,
        binary: base64Binary
    };
    
    return JSON.stringify(result, null, 2);
};

/**
 * Deserializes data from a JSON string with base64-encoded and compressed binary data.
 */
export const deserializeFromJSON = async <T>(jsonString: string): Promise<T> => {
    const parsed: SerializedJSON = JSON.parse(jsonString);
    
    const compressedBinary = base64ToUint8Array(parsed.binary);
    const combinedBinary = await decompressDeflate(compressedBinary);
    
    const binaryChunks: Uint8Array<ArrayBuffer>[] = [];
    let offset = 0;
    
    for (const length of parsed.lengths) {
        const chunk = combinedBinary.slice(offset, offset + length);
        binaryChunks.push(toArrayBufferBacked(chunk));
        offset += length;
    }
    
    return deserialize<T>({
        json: JSON.stringify(parsed.json),
        binary: binaryChunks
    });
};
