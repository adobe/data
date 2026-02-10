// © 2026 Adobe. MIT License. See /LICENSE for details.
import { blobToHash } from "./blob-to-hash.js";
import { jsonToHash } from "./json-to-hash.js";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("test hashing", () => {
  let originalCrypto: any;

  beforeEach(() => {
    // Store original crypto for restoration
    originalCrypto = crypto;
  });

  afterEach(() => {
    // Restore original crypto
    Object.defineProperty(window, 'crypto', {
      value: originalCrypto,
      writable: true,
      configurable: true
    });
    vi.restoreAllMocks();
  });

  describe("blobToHash", () => {
    it("should avoid collisions based on content and type", async () => {
      const blobs = [
        new Blob([
          new Uint8Array([
            45, 255, 128, 0, 1, 33, 33, 85, 129, 250, 245, 12, 33, 89, 7,
          ]),
        ]),
        new Blob([
          new Uint8Array([
            45, 255, 128, 0, 1, 33, 33, 85, 129, 250, 245, 12, 33, 89, 8,
          ]),
        ]),
        new Blob(["long text sample here"]),
        new Blob(["long text sample here."]),
        new Blob(["a"]),
        new Blob(["b"]),
        new Blob(["a"], { type: "octet/binary" }),
        new Blob(["a"], { type: "text/plain" }),
        //    empty blobs should work
        new Blob([""]),
        new Blob([""], { type: "octet/binary" }),
        new Blob([""], { type: "text/plain" }),
      ];
      const hashPromises = blobs.map((blob) => blobToHash(blob));
      const hashes = await Promise.all(hashPromises);
      const unique = new Set(hashes);
      const collisions = hashes.length - unique.size;
      expect(collisions).toBe(0);
    });

    it("should generate consistent hashes", async () => {
      const blobs = [
        new Blob(["long text sample here"], { type: "text/plain" }),
        new Blob(["long text sample here"], { type: "text/plain" }),
        new Blob(["long text sample here"], { type: "text/plain" }),
      ];
      const hashPromises = blobs.map((blob) => blobToHash(blob));
      const hashes = await Promise.all(hashPromises);
      const unique = new Set(hashes);
      expect(unique.size).toBe(1);
    });

    it("should handle large blobs efficiently", async () => {
      // Create a large blob (1MB) to test streaming performance
      const largeData = new Uint8Array(1024 * 1024);
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }
      const largeBlob = new Blob([largeData], { type: "application/octet-stream" });

      const startTime = performance.now();
      const hash = await blobToHash(largeBlob);
      const endTime = performance.now();

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-256 hex string length
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it("should handle blobs with complex MIME types", async () => {
      const complexTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/svg+xml; charset=utf-8",
        "text/html; charset=ISO-8859-1",
        "application/json; version=2.0",
        "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW"
      ];

      const blobs = complexTypes.map(type =>
        new Blob(["test content"], { type })
      );

      const hashPromises = blobs.map((blob) => blobToHash(blob));
      const hashes = await Promise.all(hashPromises);

      // All should be unique due to different MIME types
      const unique = new Set(hashes);
      expect(unique.size).toBe(complexTypes.length);
    });

    it("should handle empty MIME types", async () => {
      const emptyTypeBlob = new Blob(["content"], { type: "" });
      const hash = await blobToHash(emptyTypeBlob);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it("should handle unicode MIME types", async () => {
      const unicodeTypes = [
        "text/plain; charset=utf-8",
        "application/json; charset=utf-16",
        "text/html; charset=iso-8859-1"
      ];

      const blobs = unicodeTypes.map(type =>
        new Blob(["test content"], { type })
      );

      const hashPromises = blobs.map((blob) => blobToHash(blob));
      const hashes = await Promise.all(hashPromises);

      // All should be unique
      const unique = new Set(hashes);
      expect(unique.size).toBe(unicodeTypes.length);
    });

    it("should handle very large MIME types", async () => {
      // Test with extremely long MIME type
      const longMimeType = "application/" + "x".repeat(1000) + "; charset=utf-8";
      const blob = new Blob(["test content"], { type: longMimeType });
      const hash = await blobToHash(blob);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it("should handle blobs with special characters in MIME type", async () => {
      const specialMimeTypes = [
        "text/plain; charset=utf-8; boundary=\"----=_NextPart_000_0001_01C12345.ABCDEF12\"",
        "application/json; version=\"2.0\"; encoding=\"utf-8\"",
        "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW; charset=utf-8"
      ];

      const blobs = specialMimeTypes.map(type =>
        new Blob(["test content"], { type })
      );

      const hashPromises = blobs.map((blob) => blobToHash(blob));
      const hashes = await Promise.all(hashPromises);

      // All should be unique
      const unique = new Set(hashes);
      expect(unique.size).toBe(specialMimeTypes.length);
    });

    describe("streaming path (DigestStream)", () => {
      it("should use DigestStream when available", async () => {
        // Mock DigestStream to verify it's being used
        const mockDigestStream = {
          writable: {
            getWriter: vi.fn().mockReturnValue({
              write: vi.fn().mockResolvedValue(undefined),
              close: vi.fn().mockResolvedValue(undefined)
            })
          },
          digest: Promise.resolve(new ArrayBuffer(32))
        };

        const mockCrypto = {
          ...originalCrypto,
          DigestStream: vi.fn().mockImplementation(() => mockDigestStream)
        };

        Object.defineProperty(window, 'crypto', {
          value: mockCrypto,
          writable: true,
          configurable: true
        });

        const blob = new Blob(["test content"], { type: "text/plain" });
        await blobToHash(blob);

        expect(mockCrypto.DigestStream).toHaveBeenCalledWith("SHA-256");
        expect(mockDigestStream.writable.getWriter).toHaveBeenCalled();
      });

      it("should handle streaming errors gracefully", async () => {
        const mockDigestStream = {
          writable: {
            getWriter: vi.fn().mockReturnValue({
              write: vi.fn().mockRejectedValue(new Error("Stream write error")),
              close: vi.fn().mockResolvedValue(undefined)
            })
          },
          digest: Promise.resolve(new ArrayBuffer(32))
        };

        const mockCrypto = {
          ...originalCrypto,
          DigestStream: vi.fn().mockImplementation(() => mockDigestStream)
        };

        Object.defineProperty(window, 'crypto', {
          value: mockCrypto,
          writable: true,
          configurable: true
        });

        const blob = new Blob(["test content"], { type: "text/plain" });

        await expect(blobToHash(blob)).rejects.toThrow("Stream write error");
      });

      it("should handle DigestStream digest errors", async () => {
        const mockDigestStream = {
          writable: {
            getWriter: vi.fn().mockReturnValue({
              write: vi.fn().mockResolvedValue(undefined),
              close: vi.fn().mockResolvedValue(undefined)
            })
          },
          get digest() {
            return Promise.reject(new Error("Digest error"));
          }
        };

        const mockCrypto = {
          ...originalCrypto,
          DigestStream: vi.fn().mockImplementation(() => mockDigestStream)
        };

        Object.defineProperty(window, 'crypto', {
          value: mockCrypto,
          writable: true,
          configurable: true
        });

        const blob = new Blob(["test content"], { type: "text/plain" });

        // Handle the unhandled rejection by catching it
        try {
          await blobToHash(blob);
          // If we get here, the test should fail
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe("Digest error");
        }
      });
    });

    describe("fallback path (buffer-based)", () => {
      it("should fall back to buffer-based approach when DigestStream unavailable", async () => {
        // Remove DigestStream from crypto but keep subtle
        const mockCrypto = {
          ...originalCrypto,
          subtle: originalCrypto.subtle
        };
        delete (mockCrypto as any).DigestStream;

        Object.defineProperty(window, 'crypto', {
          value: mockCrypto,
          writable: true,
          configurable: true
        });

        const blob = new Blob(["test content"], { type: "text/plain" });
        const hash = await blobToHash(blob);

        expect(hash).toBeDefined();
        expect(hash.length).toBe(64);
      });

      it("should handle buffer-based approach with large blobs", async () => {
        // Remove DigestStream from crypto but keep subtle
        const mockCrypto = {
          ...originalCrypto,
          subtle: originalCrypto.subtle
        };
        delete (mockCrypto as any).DigestStream;

        Object.defineProperty(window, 'crypto', {
          value: mockCrypto,
          writable: true,
          configurable: true
        });

        // Create a moderately large blob
        const data = new Uint8Array(100 * 1024); // 100KB
        for (let i = 0; i < data.length; i++) {
          data[i] = i % 256;
        }
        const blob = new Blob([data], { type: "application/octet-stream" });

        const hash = await blobToHash(blob);
        expect(hash).toBeDefined();
        expect(hash.length).toBe(64);
      });
    });

    it("should produce same hash regardless of path used", async () => {
      const testBlob = new Blob(["test content"], { type: "text/plain" });

      // Test with streaming path (if available)
      const streamingHash = await blobToHash(testBlob);

      // Test with fallback path
      const mockCrypto = {
        ...originalCrypto,
        subtle: originalCrypto.subtle
      };
      delete (mockCrypto as any).DigestStream;

      Object.defineProperty(window, 'crypto', {
        value: mockCrypto,
        writable: true,
        configurable: true
      });

      const fallbackHash = await blobToHash(testBlob);

      // Both should produce the same hash for the same input
      expect(streamingHash).toBe(fallbackHash);
    });

    it("should produce identical hashes for multiple test cases", async () => {
      const testCases = [
        { content: "simple text", type: "text/plain" },
        { content: "complex content with special chars: !@#$%^&*()", type: "application/json" },
        { content: "", type: "text/plain" },
        { content: "a", type: "" },
        { content: "very long content ".repeat(100), type: "text/html; charset=utf-8" }
      ];

      for (const testCase of testCases) {
        const blob = new Blob([testCase.content], { type: testCase.type });

        // Get streaming hash
        const streamingHash = await blobToHash(blob);

        // Get fallback hash
        const mockCrypto = {
          ...originalCrypto,
          subtle: originalCrypto.subtle
        };
        delete (mockCrypto as any).DigestStream;

        Object.defineProperty(window, 'crypto', {
          value: mockCrypto,
          writable: true,
          configurable: true
        });

        const fallbackHash = await blobToHash(blob);

        // Verify they match
        expect(streamingHash).toBe(fallbackHash);
      }
    });
  });

  describe("jsonToHash", () => {
    it("should avoid collisions", async () => {
      const values = [
        "foo",
        { a: 1 },
        {},
        [],
        { a: 2 },
        null,
        "",
        { alpha: "bravo" },
      ];
      const hashPromises = values.map((value) => jsonToHash(value));
      const hashes = await Promise.all(hashPromises);
      const unique = new Set(hashes);
      const collisions = hashes.length - unique.size;
      expect(collisions).toBe(0);
    });

    it("should generate consistent hashes", async () => {
      const values = [
        { a: 1, b: 2, foo: "bar" },
        { a: 1, b: 2, foo: "bar" },
        { a: 1, b: 2, foo: "bar" },
      ];
      const hashPromises = values.map((value) => jsonToHash(value));
      const hashes = await Promise.all(hashPromises);
      const unique = new Set(hashes);
      expect(unique.size).toBe(1);
    });
  });
});
