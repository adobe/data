// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { type BlobStore, createBlobStore } from "./blob-store.js";

describe("blobStore", () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    const mockCreateObjectURL = vi.fn((blob: Blob) => `blob:${Math.random()}`);
    const mockRevokeObjectURL = vi.fn();
    let testBlobStore: BlobStore;
    let createdUrl: string;

    beforeEach(async () => {
        // Setup URL mock functions
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;

        // Ensure we create a non-http URL
        mockCreateObjectURL.mockImplementation((blob: Blob) => {
            createdUrl = `blob:${Math.random()}`;
            return createdUrl;
        });

        URL.createObjectURL = mockCreateObjectURL;
        URL.revokeObjectURL = mockRevokeObjectURL;

        // Clear mock call history
        mockCreateObjectURL.mockClear();
        mockRevokeObjectURL.mockClear();

        testBlobStore = await createBlobStore();

        return () => {
            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
        };
    });

    afterEach(() => {
        // Clean up any remaining borrowed URLs
        mockCreateObjectURL.mockReset();
        mockRevokeObjectURL.mockReset();
    });

    describe("URL reference counting", () => {
        it("should reuse the same URL for multiple borrows of the same blob", async () => {
            // Create a test blob
            const testBlob = new Blob(["test"], { type: "text/plain" });
            const blobRef = await testBlobStore.getRef(testBlob);

            // Borrow the URL multiple times
            const url1 = await testBlobStore.borrowUrl(blobRef);
            const url2 = await testBlobStore.borrowUrl(blobRef);
            const url3 = await testBlobStore.borrowUrl(blobRef);

            expect(url1).toBeTruthy();
            expect(url1).toBe(url2);
            expect(url2).toBe(url3);
            expect(url1).toMatch(/^blob:/); // Verify it's a blob URL

            // createObjectURL should only be called once
            expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);

            // Clean up
            testBlobStore.returnUrl(url1);
            testBlobStore.returnUrl(url2);
            testBlobStore.returnUrl(url3);
        });

        it("should only revoke URL when all references are returned", async () => {
            const testBlob = new Blob(["test"], { type: "text/plain" });
            const blobRef = await testBlobStore.getRef(testBlob);

            // Borrow the URL three times
            const url1 = await testBlobStore.borrowUrl(blobRef);
            const url2 = await testBlobStore.borrowUrl(blobRef);
            const url3 = await testBlobStore.borrowUrl(blobRef);

            expect(url1).toMatch(/^blob:/); // Verify it's a blob URL

            // Return URLs one by one
            testBlobStore.returnUrl(url1);
            expect(mockRevokeObjectURL).not.toHaveBeenCalled();

            testBlobStore.returnUrl(url2);
            expect(mockRevokeObjectURL).not.toHaveBeenCalled();

            testBlobStore.returnUrl(url3);
            expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
            expect(mockRevokeObjectURL).toHaveBeenCalledWith(createdUrl);
        });

        it("should handle remote URLs correctly", async () => {
            const remoteRef = testBlobStore.createRemoteBlobRef("http://example.com/image.jpg");

            // Borrow remote URL multiple times
            const url1 = await testBlobStore.borrowUrl(remoteRef);
            const url2 = await testBlobStore.borrowUrl(remoteRef);

            expect(url1).toBe("http://example.com/image.jpg");
            expect(url2).toBe("http://example.com/image.jpg");
            expect(mockCreateObjectURL).not.toHaveBeenCalled();

            // Return URLs
            testBlobStore.returnUrl(url1);
            testBlobStore.returnUrl(url2);

            // Should not revoke remote URLs
            expect(mockRevokeObjectURL).not.toHaveBeenCalled();
        });

        it("should handle null inputs gracefully", async () => {
            const nullUrl = await testBlobStore.borrowUrl(null);
            expect(nullUrl).toBeNull();

            // Should not throw when returning null
            expect(() => testBlobStore.returnUrl(null)).not.toThrow();
        });

        it('demonstrates race condition in borrowUrl', async () => {
            const store = testBlobStore;
            const testBlob = new Blob(['test data'], { type: 'text/plain' });
            const blobRef = await store.getRef(testBlob);

            // Create an artificially delayed getBlob to simulate network latency
            const originalGetBlob = store.getBlob;
            store.getBlob = async (ref) => {
                await new Promise(resolve => setTimeout(resolve, 50)); // Add delay
                return originalGetBlob(ref);
            };

            // Make two parallel borrowUrl calls
            const [url1, url2] = await Promise.all([
                store.borrowUrl(blobRef),
                store.borrowUrl(blobRef)
            ]);

            expect(url1).toBe(url2); // Same URL should be returned

            // Return one of the URLs
            store.returnUrl(url1);

            // Verify that the borrow count is still 1 since we borrowed twice and returned once
            expect(store._testGetBorrowCount(blobRef)).toBe(1);

            // Return the second URL
            store.returnUrl(url2);

            // Verify the borrow count is now 0
            expect(store._testGetBorrowCount(blobRef)).toBe(0);

            // Verify the URL was revoked
            expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
            expect(mockRevokeObjectURL).toHaveBeenCalledWith(url1);
        });
    });
}); 
