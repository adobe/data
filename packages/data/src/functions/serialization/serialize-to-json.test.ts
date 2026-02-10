// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { serializeToJSON, deserializeFromJSON } from "./serialize-to-json.js";

describe("serializeToJSON", () => {
    it("should serialize and deserialize primitive data", async () => {
        const data = {
            string: "hello world",
            number: 42,
            boolean: true,
            null: null,
            array: [1, 2, 3, "test"]
        };

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString);

        expect(result).toEqual(data);
    });

    it("should return a valid JSON string", async () => {
        const data = { test: "data" };
        const jsonString = await serializeToJSON(data);

        // Should be parseable
        expect(() => JSON.parse(jsonString)).not.toThrow();
        
        // Should be a string
        expect(typeof jsonString).toBe("string");
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

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString) as typeof data;

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

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString) as typeof data;

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

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString) as typeof data;

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

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString) as typeof data;

        expect(result.large).toEqual(data.large);
        expect(result.small).toEqual(data.small);
    });

    it("should handle data with no binary content", async () => {
        const data = {
            name: "Alice",
            age: 30,
            hobbies: ["reading", "gaming"],
            nested: {
                value: 42,
                flag: true
            }
        };

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString);

        expect(result).toEqual(data);
    });

    it("should handle multiple typed arrays of different sizes", async () => {
        const data = {
            tiny: new Uint8Array([1]),
            small: new Uint16Array([1, 2, 3, 4]),
            medium: new Float32Array(new Array(100).fill(0).map((_, i) => i * 0.5)),
            large: new Int32Array(new Array(1000).fill(0).map((_, i) => i))
        };

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString) as typeof data;

        expect(result.tiny).toEqual(data.tiny);
        expect(result.small).toEqual(data.small);
        expect(result.medium).toEqual(data.medium);
        expect(result.large).toEqual(data.large);
    });

    it("should preserve typed array types after round-trip", async () => {
        const data = {
            uint8: new Uint8Array([1, 2, 3]),
            float32: new Float32Array([1.5, 2.5]),
            int16: new Int16Array([-100, 100])
        };

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString) as typeof data;

        expect(result.uint8).toBeInstanceOf(Uint8Array);
        expect(result.float32).toBeInstanceOf(Float32Array);
        expect(result.int16).toBeInstanceOf(Int16Array);
    });

    it("should handle complex nested structures", async () => {
        const data = {
            level1: {
                level2: {
                    level3: {
                        array: new Float64Array([Math.PI, Math.E]),
                        data: "deeply nested"
                    },
                    array: new Uint32Array([1, 2, 3])
                },
                primitive: 42
            },
            arrays: [
                new Uint8Array([1, 2]),
                new Float32Array([3.14, 2.71]),
                { nested: new Int8Array([-1, -2, -3]) }
            ]
        };

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString) as typeof data;

        expect(result.level1.level2.level3.array).toEqual(data.level1.level2.level3.array);
        expect(result.level1.level2.level3.data).toBe(data.level1.level2.level3.data);
        expect(result.level1.level2.array).toEqual(data.level1.level2.array);
        expect(result.level1.primitive).toBe(data.level1.primitive);
        expect(result.arrays[0]).toEqual(data.arrays[0]);
        expect(result.arrays[1]).toEqual(data.arrays[1]);
        expect((result.arrays[2] as any).nested).toEqual((data.arrays[2] as any).nested);
    });

    it("should handle arrays containing typed arrays", async () => {
        const data = {
            arrayOfArrays: [
                new Uint8Array([1, 2, 3]),
                new Uint16Array([4, 5, 6]),
                new Float32Array([7.1, 8.2, 9.3])
            ]
        };

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString) as typeof data;

        expect(result.arrayOfArrays[0]).toEqual(data.arrayOfArrays[0]);
        expect(result.arrayOfArrays[1]).toEqual(data.arrayOfArrays[1]);
        expect(result.arrayOfArrays[2]).toEqual(data.arrayOfArrays[2]);
    });

    it("should produce different strings for different data", async () => {
        const data1 = { value: new Uint8Array([1, 2, 3]) };
        const data2 = { value: new Uint8Array([4, 5, 6]) };

        const json1 = await serializeToJSON(data1);
        const json2 = await serializeToJSON(data2);

        expect(json1).not.toBe(json2);
    });

    it("should handle special float values", async () => {
        const data = {
            infinity: new Float32Array([Infinity, -Infinity]),
            nan: new Float64Array([NaN]),
            normal: new Float32Array([1.5, -2.5, 0.0])
        };

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString) as typeof data;

        expect(result.infinity[0]).toBe(Infinity);
        expect(result.infinity[1]).toBe(-Infinity);
        expect(result.nan[0]).toBe(NaN);
        expect(result.normal).toEqual(data.normal);
    });

    it("should handle boundary values for integer types", async () => {
        const data = {
            uint8: new Uint8Array([0, 255]),
            int8: new Int8Array([-128, 127]),
            uint16: new Uint16Array([0, 65535]),
            int16: new Int16Array([-32768, 32767]),
            uint32: new Uint32Array([0, 4294967295]),
            int32: new Int32Array([-2147483648, 2147483647])
        };

        const jsonString = await serializeToJSON(data);
        const result = await deserializeFromJSON(jsonString) as typeof data;

        expect(result.uint8).toEqual(data.uint8);
        expect(result.int8).toEqual(data.int8);
        expect(result.uint16).toEqual(data.uint16);
        expect(result.int16).toEqual(data.int16);
        expect(result.uint32).toEqual(data.uint32);
        expect(result.int32).toEqual(data.int32);
    });
});

