// © 2026 Adobe. MIT License. See /LICENSE for details.
import { normalize } from "./normalize.js";
import { describe, expect, it } from "vitest";

describe("Data.normalize", () => {
  it("should sort object keys alphabetically", () => {
    expect(normalize({ b: 1, a: 2, c: null })).toEqual({
      a: 2,
      b: 1,
      c: null,
    });
    expect(normalize([{ A: [], b: 1, a: 2 }])).toEqual([{ a: 2, A: [], b: 1 }]);
    expect(normalize([[{ b: 1, a: 2 }]])).toEqual([[{ a: 2, b: 1 }]]);
    expect(normalize({ z: [[{ b: 1, a: 2 }]], q: 10 })).toEqual({
      q: 10,
      z: [[{ a: 2, b: 1 }]],
    });
  });
  it("should remove undefined values", () => {
    expect(normalize({ b: 1, a: 2, value: undefined })).toEqual({
      a: 2,
      b: 1,
    });
    expect(normalize([{ b: 1, a: 2, value: undefined }])).toEqual([
      { a: 2, b: 1 },
    ]);
  });
});
