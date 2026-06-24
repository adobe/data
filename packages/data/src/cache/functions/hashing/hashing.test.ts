// © 2026 Adobe. MIT License. See /LICENSE for details.
import { blobToHash } from "./blob-to-hash.js";
import { jsonToHash } from "./json-to-hash.js";
import { describe, expect, it } from "vitest";

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

// Lets all pending microtasks (and the WASM-instantiation promise) settle, so
// each in-flight blobToHash call advances to its next `await reader.read()`.
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// A stand-in Blob whose stream yields `chunks` one `read()` at a time, but only
// when the test releases each gate. This hands the test control of the exact
// interleaving across concurrent calls — impossible with a real in-memory Blob,
// whose reads resolve on their own schedule.
function gatedBlob(type: string, chunks: Uint8Array[]) {
  const gates: Array<() => void> = [];
  let i = 0;
  const reader = {
    read: () =>
      new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
        gates.push(() =>
          resolve(
            i < chunks.length
              ? { done: false, value: chunks[i++] }
              : { done: true, value: undefined },
          ),
        );
      }),
  };
  return {
    // Case 1 cast: this implements the only members blobToHash reads off a
    // Blob — `type` and `stream().getReader().read()`.
    blob: { type, stream: () => ({ getReader: () => reader }) } as unknown as Blob,
    releaseNext: (): boolean => {
      const gate = gates.shift();
      gate?.();
      return gate !== undefined;
    },
  };
}

describe("test hashing", () => {
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
        new Blob([""]),
        new Blob([""], { type: "octet/binary" }),
        new Blob([""], { type: "text/plain" }),
      ];
      const hashPromises = blobs.map((blob) => blobToHash(blob));
      const hashes = await Promise.all(hashPromises);
      const unique = new Set(hashes);
      expect(hashes.length - unique.size).toBe(0);
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

    it("should handle blobs with complex MIME types", async () => {
      const complexTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/svg+xml; charset=utf-8",
        "text/html; charset=ISO-8859-1",
        "application/json; version=2.0",
        "multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW"
      ];
      const blobs = complexTypes.map(type => new Blob(["test content"], { type }));
      const hashPromises = blobs.map((blob) => blobToHash(blob));
      const hashes = await Promise.all(hashPromises);
      expect(new Set(hashes).size).toBe(complexTypes.length);
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
      const blobs = unicodeTypes.map(type => new Blob(["test content"], { type }));
      const hashPromises = blobs.map((blob) => blobToHash(blob));
      const hashes = await Promise.all(hashPromises);
      expect(new Set(hashes).size).toBe(unicodeTypes.length);
    });

    it("should handle very large MIME types", async () => {
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
      const blobs = specialMimeTypes.map(type => new Blob(["test content"], { type }));
      const hashPromises = blobs.map((blob) => blobToHash(blob));
      const hashes = await Promise.all(hashPromises);
      expect(new Set(hashes).size).toBe(specialMimeTypes.length);
    });

    it("should return 64-character hex string", async () => {
      const blobs = [
        new Blob(["x"], { type: "text/plain" }),
        new Blob([], { type: "application/octet-stream" }),
      ];
      for (const blob of blobs) {
        const hash = await blobToHash(blob);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it("interleaved concurrent reads match serial hashes", async () => {
      const inputs = [
        { type: "text/plain", chunks: ["alpha-", "one-", "end"] },
        { type: "application/octet-stream", chunks: ["BETA-", "two-", "END"] },
        { type: "", chunks: ["g", "amma", "!!!"] },
      ];

      // Oracle: hash each input serially. SHA-256 is over the byte stream, so a
      // real Blob of the concatenated chunks yields the same digest the gated
      // blob must produce regardless of chunk boundaries.
      const oracle: string[] = [];
      for (const { type, chunks } of inputs) {
        oracle.push(await blobToHash(new Blob(chunks, { type })));
      }

      // Concurrent: start every call, then drive the gates round-robin so the
      // calls interleave between chunks — the exact pattern that corrupts a
      // naively shared hasher.
      const gated = inputs.map(({ type, chunks }) => gatedBlob(type, chunks.map(bytes)));
      const results = gated.map((g) => blobToHash(g.blob));

      let progressed = true;
      while (progressed) {
        await flush();
        progressed = false;
        for (const g of gated) {
          if (g.releaseNext()) progressed = true;
        }
      }
      await flush();

      expect(await Promise.all(results)).toEqual(oracle);
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
