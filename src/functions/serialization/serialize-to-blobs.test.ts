// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { serializeToBlobs, deserializeFromBlobs } from "./serialize-to-blobs.js";

describe("serializeToBlobs", () => {
    it("should serialize and deserialize primitive data", async () => {
        const data = {
            string: "hello world",
            number: 42,
            boolean: true,
            null: null,
            array: [1, 2, 3, "test"]
        };

        const blobs = await serializeToBlobs(data);
        const result = await deserializeFromBlobs(blobs);

        expect(result).toEqual(data);
    });

    it("should serialize and deserialize all typed arrays", async () => {
        const data = {
            uint8Array: new Uint8Array([1, 2, 3, 4, 5]),
            uint16Array: new Uint16Array([1000, 2000, 3000]),
            uint32Array: new Uint32Array([1000000, 2000000]),
            int8Array: new Int8Array([-1, -2, -3]),
            int16Array: new Int16Array([-1000, -2000]),
            int32Array: new Int32Array([-1000000, -2000000]),
            float32Array: new Float32Array([1.5, 2.5, 3.5]),
            float64Array: new Float64Array([1.123456789, 2.987654321])
        };

        const blobs = await serializeToBlobs(data);
        const result = await deserializeFromBlobs(blobs) as typeof data;

        expect(result.uint8Array).toEqual(data.uint8Array);
        expect(result.uint16Array).toEqual(data.uint16Array);
        expect(result.uint32Array).toEqual(data.uint32Array);
        expect(result.int8Array).toEqual(data.int8Array);
        expect(result.int16Array).toEqual(data.int16Array);
        expect(result.int32Array).toEqual(data.int32Array);
        expect(result.float32Array).toEqual(data.float32Array);
        expect(result.float64Array).toEqual(data.float64Array);
    });

    it("should serialize and deserialize nested objects with typed arrays", async () => {
        const data = {
            user: {
                name: "John Doe",
                scores: new Uint16Array([95, 87, 92, 88]),
                coordinates: new Float32Array([10.5, 20.3, 30.7])
            },
            metadata: {
                timestamp: 1234567890,
                flags: new Uint8Array([1, 0, 1, 1, 0]),
                measurements: new Float64Array([1.23456789, 2.34567890, 3.45678901])
            }
        };

        const blobs = await serializeToBlobs(data);
        const result = await deserializeFromBlobs(blobs) as typeof data;

        expect(result.user.name).toBe(data.user.name);
        expect(result.user.scores).toEqual(data.user.scores);
        expect(result.user.coordinates).toEqual(data.user.coordinates);
        expect(result.metadata.timestamp).toBe(data.metadata.timestamp);
        expect(result.metadata.flags).toEqual(data.metadata.flags);
        expect(result.metadata.measurements).toEqual(data.metadata.measurements);
    });

    it("should handle empty typed arrays", async () => {
        const data = {
            emptyUint8: new Uint8Array([]),
            emptyUint16: new Uint16Array([]),
            emptyUint32: new Uint32Array([]),
            emptyFloat32: new Float32Array([]),
            mixed: {
                empty: new Int16Array([]),
                nonEmpty: new Uint32Array([1, 2, 3])
            }
        };

        const blobs = await serializeToBlobs(data);
        const result = await deserializeFromBlobs(blobs) as typeof data;

        expect(result.emptyUint8).toEqual(data.emptyUint8);
        expect(result.emptyUint16).toEqual(data.emptyUint16);
        expect(result.emptyUint32).toEqual(data.emptyUint32);
        expect(result.emptyFloat32).toEqual(data.emptyFloat32);
        expect(result.mixed.empty).toEqual(data.mixed.empty);
        expect(result.mixed.nonEmpty).toEqual(data.mixed.nonEmpty);
    });

    it("should handle large typed arrays", async () => {
        const largeArray = new Uint8Array(10000);
        for (let i = 0; i < largeArray.length; i++) {
            largeArray[i] = i % 256;
        }

        const data = {
            large: largeArray,
            small: new Float32Array([1.1, 2.2, 3.3])
        };

        const blobs = await serializeToBlobs(data);
        const result = await deserializeFromBlobs(blobs) as typeof data;

        expect(result.large).toEqual(data.large);
        expect(result.small).toEqual(data.small);
    });

    it("should preserve blob types and metadata", async () => {
        const data = { test: "data" };
        const blobs = await serializeToBlobs(data);

        expect(blobs.json.type).toBe("application/json");
        expect(blobs.binary.type).toBe("application/octet-stream");
        expect(blobs.json.size).toBeGreaterThan(0);
    });
}); 