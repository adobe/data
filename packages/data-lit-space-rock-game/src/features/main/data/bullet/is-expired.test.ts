// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Bullet } from "./bullet.js";

describe("Bullet.isExpired", () => {
  it("is alive well within its lifetime", () => {
    expect(Bullet.isExpired(0, 0.016)).toBe(false);
  });

  it("expires once age + dt reaches the lifetime", () => {
    expect(Bullet.isExpired(Bullet.lifetime - 0.01, 0.02)).toBe(true);
    expect(Bullet.isExpired(Bullet.lifetime, 0)).toBe(true);
  });
});
