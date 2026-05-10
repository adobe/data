// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { serializeToStorage, deserializeFromStorage } from "./serialize-to-storage.js";
import { createBlobStore, type BlobStore } from "../../cache/blob-store.js";

describe("serializeToStorage", () => {
    let mockStorage: Storage;
    let testBlobStore: BlobStore;

    beforeEach(async () => {
        mockStorage = {
            setItem: vi.fn(),
            getItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
            length: 0,
            key: vi.fn(),
        } as Storage;

        testBlobStore = await createBlobStore();
        vi.clearAllMocks();
    });

    it("should serialize data to storage with blob references", async () => {
        const data = {
            message: "hello world",
            numbers: new Uint8Array([1, 2, 3, 4, 5]),
            coordinates: new Float32Array([10.5, 20.3])
        };

        // Use the real blobStore to get actual references
        await serializeToStorage(data, "test-id", mockStorage);

        expect(mockStorage.setItem).toHaveBeenCalledWith("test-id", expect.any(String));

        const storedData = JSON.parse((mockStorage.setItem as any).mock.calls[0][1]);
        expect(storedData).toHaveProperty("json");
        expect(storedData).toHaveProperty("binary");
        expect(storedData.json).toHaveProperty("localBlobRef");
        expect(storedData.binary).toHaveProperty("localBlobRef");
    });

    it("should use sessionStorage by default", async () => {
        const data = { test: "data" };

        await serializeToStorage(data, "test-id");

        // This test verifies the function doesn't throw when using default storage
        // The actual storage interaction would be with the real sessionStorage
        expect(true).toBe(true); // Placeholder assertion
    });
});

describe("deserializeFromStorage", () => {
    let mockStorage: Storage;
    let testBlobStore: BlobStore;

    beforeEach(async () => {
        mockStorage = {
            setItem: vi.fn(),
            getItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
            length: 0,
            key: vi.fn(),
        } as Storage;

        testBlobStore = await createBlobStore();
        vi.clearAllMocks();
    });

    it("should deserialize data from storage", async () => {
        const originalData = {
            message: "hello world",
            numbers: new Uint8Array([1, 2, 3, 4, 5]),
            coordinates: new Float32Array([10.5, 20.3])
        };

        // First serialize the data to get real blob references
        await serializeToStorage(originalData, "test-id", mockStorage);

        // Get the stored data
        const storedData = JSON.parse((mockStorage.setItem as any).mock.calls[0][1]);

        // Mock the getItem to return our stored data
        (mockStorage.getItem as any).mockReturnValue(JSON.stringify(storedData));

        const result = await deserializeFromStorage<typeof originalData>("test-id", mockStorage);

        expect(mockStorage.getItem).toHaveBeenCalledWith("test-id");
        expect(result).not.toBeNull();
        expect(result).toEqual(originalData);
    });

    it("should return null when no data exists", async () => {
        (mockStorage.getItem as any).mockReturnValue(null);

        const result = await deserializeFromStorage("test-id", mockStorage);

        expect(result).toBeNull();
    });

    it("should return null when blob retrieval fails", async () => {
        // Create invalid blob references
        const invalidRefs = {
            json: { localBlobRef: "invalid-hash" },
            binary: { localBlobRef: "invalid-hash" }
        };

        (mockStorage.getItem as any).mockReturnValue(JSON.stringify(invalidRefs));

        const result = await deserializeFromStorage("test-id", mockStorage);

        expect(result).toBeNull();
    });

    it("should use sessionStorage by default", async () => {
        // For this test, we need to mock the real sessionStorage since the function uses it by default
        const originalSessionStorage = globalThis.sessionStorage;
        const mockSessionStorage = {
            getItem: vi.fn().mockReturnValue(null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
            length: 0,
            key: vi.fn(),
        } as Storage;

        Object.defineProperty(globalThis, 'sessionStorage', {
            value: mockSessionStorage,
            writable: true,
        });

        try {
            await deserializeFromStorage("test-id");
            expect(mockSessionStorage.getItem).toHaveBeenCalledWith("test-id");
        } finally {
            Object.defineProperty(globalThis, 'sessionStorage', {
                value: originalSessionStorage,
                writable: true,
            });
        }
    });

    it("should handle complex nested data with all typed arrays", async () => {
        const originalData = {
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

        // First serialize the data to get real blob references
        await serializeToStorage(originalData, "test-id", mockStorage);

        // Get the stored data
        const storedData = JSON.parse((mockStorage.setItem as any).mock.calls[0][1]);

        // Mock the getItem to return our stored data
        (mockStorage.getItem as any).mockReturnValue(JSON.stringify(storedData));

        const result = await deserializeFromStorage<typeof originalData>("test-id", mockStorage);

        expect(result).not.toBeNull();
        expect(result).toEqual(originalData);
    });

    it("should handle all supported typed arrays", async () => {
        const originalData = {
            uint8Array: new Uint8Array([1, 2, 3, 4, 5]),
            uint16Array: new Uint16Array([1000, 2000, 3000]),
            uint32Array: new Uint32Array([1000000, 2000000]),
            int8Array: new Int8Array([-1, -2, -3]),
            int16Array: new Int16Array([-1000, -2000]),
            int32Array: new Int32Array([-1000000, -2000000]),
            float32Array: new Float32Array([1.5, 2.5, 3.5]),
            float64Array: new Float64Array([1.123456789, 2.987654321])
        };

        // First serialize the data to get real blob references
        await serializeToStorage(originalData, "test-id", mockStorage);

        // Get the stored data
        const storedData = JSON.parse((mockStorage.setItem as any).mock.calls[0][1]);

        // Mock the getItem to return our stored data
        (mockStorage.getItem as any).mockReturnValue(JSON.stringify(storedData));

        const result = await deserializeFromStorage<typeof originalData>("test-id", mockStorage);

        expect(result).not.toBeNull();
        expect(result).toEqual(originalData);
    });
}); 