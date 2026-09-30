// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Collision } from "./collision.js";

describe("Collision.segmentCircleOverlap", () => {
  it("hits when the segment passes through the circle though both endpoints are outside", () => {
    // Endpoints [50,0] and [0,0] are each 25px from [25,0] (radius 22), but the
    // segment crosses the centre — the tunnelling case a point test would miss.
    expect(Collision.segmentCircleOverlap([50, 0], [0, 0], [25, 0], 22)).toBe(true);
  });

  it("a degenerate segment (p0==p1) reduces to point-vs-circle: inside → true", () => {
    expect(Collision.segmentCircleOverlap([25, 0], [25, 0], [25, 0], 22)).toBe(true);
  });

  it("a degenerate segment (p0==p1) reduces to point-vs-circle: outside → false", () => {
    expect(Collision.segmentCircleOverlap([100, 0], [100, 0], [25, 0], 22)).toBe(false);
  });

  it("misses when the whole segment stays farther than the radius from the centre", () => {
    expect(Collision.segmentCircleOverlap([0, 100], [50, 100], [25, 0], 22)).toBe(false);
  });

  it("touches exactly at the boundary (inclusive)", () => {
    expect(Collision.segmentCircleOverlap([0, 22], [50, 22], [25, 0], 22)).toBe(true);
  });
});
