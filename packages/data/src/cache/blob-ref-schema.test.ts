// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { BlobRefSchema, isBlobRef } from "./blob-store.js";
import { validate } from "../schema/validation/validate.js";

describe("BlobRefSchema", () => {
  it("accepts a local-only ref", () => {
    expect(validate(BlobRefSchema, { localBlobRef: "abc" })).toEqual([]);
  });

  it("accepts a remote-only ref", () => {
    expect(validate(BlobRefSchema, { remoteBlobRef: "http://x/a" })).toEqual([]);
  });

  it("accepts a combined ref (both keys present)", () => {
    expect(
      validate(BlobRefSchema, { localBlobRef: "abc", remoteBlobRef: "http://x/a" })
    ).toEqual([]);
  });

  it("rejects an empty ref (at least one key required)", () => {
    expect(validate(BlobRefSchema, {}).length).toBeGreaterThan(0);
  });

  it("rejects extra properties", () => {
    expect(
      validate(BlobRefSchema, { localBlobRef: "abc", extra: 1 }).length
    ).toBeGreaterThan(0);
  });

  it("rejects a non-http remote url", () => {
    expect(
      validate(BlobRefSchema, { remoteBlobRef: "ftp://x/a" }).length
    ).toBeGreaterThan(0);
  });

  it("guards a combined ref as a BlobRef", () => {
    expect(isBlobRef({ localBlobRef: "abc", remoteBlobRef: "http://x/a" })).toBe(
      true
    );
  });
});
