// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { buildDouble } from "./build-double.js";

const template = () => ({
  serviceName: "rng",
  next: () => 0,
  fetch: () => Promise.resolve(""),
  log: () => {},
});
type Rng = ReturnType<typeof template>;

describe("buildDouble", () => {
  it("returns scheduled responses in order", () => {
    const double = buildDouble(template, { next: [1, 2] }) as Rng;
    expect([double.next(), double.next()]).toEqual([1, 2]);
  });

  it("throws on a value method with no response scheduled", () => {
    const double = buildDouble(template, undefined) as Rng;
    expect(() => double.next()).toThrow('no response scheduled for "rng.next"');
    expect(() => double.fetch()).toThrow('no response scheduled for "rng.fetch"');
  });

  it("throws once a schedule is exhausted", () => {
    const double = buildDouble(template, { next: [1] }) as Rng;
    double.next();
    expect(() => double.next()).toThrow('response schedule exhausted for "rng.next"');
  });

  it("lets a void method run unscheduled", () => {
    const double = buildDouble(template, undefined) as Rng;
    expect(double.log()).toBeUndefined();
  });

  it("returns undefined for an unscheduled value method when lenient", () => {
    const double = buildDouble(template, undefined, true) as Rng;
    expect(double.next()).toBeUndefined();
    expect(double.fetch()).toBeUndefined();
  });

  it("still throws once a lenient schedule is exhausted", () => {
    const double = buildDouble(template, { next: [1] }, true) as Rng;
    double.next();
    expect(() => double.next()).toThrow('response schedule exhausted for "rng.next"');
  });
});
