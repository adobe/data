// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Quat } from "@adobe/data/math";
import type { Schema } from "@adobe/data/schema";
import { interpolate } from "./interpolate.js";

describe("interpolate", () => {
    it("resolves a schema's named interpolator via the registry (Quat linear ⇒ slerp)", () => {
        const a: Quat = [0, 0, 0, 1];                                 // identity
        const b: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2];          // 90° about Y
        // Must equal slerp exactly — proving it dispatched to the registered
        // "slerp" function, not the componentwise-lerp fallback (which would
        // produce a different, non-normalized result).
        expect(interpolate(Quat.schema, "linear", a, b, 0.5)).toEqual(Quat.slerp(a, b, 0.5));
    });

    it("falls back to componentwise lerp when no interpolator is named", () => {
        const schema: Schema = { type: "array", items: { type: "number" } };
        expect(interpolate(schema, "linear", [0, 10], [10, 20], 0.5)).toEqual([5, 15]);
    });

    it("throws on a named interpolator that isn't registered", () => {
        const schema: Schema = { type: "number", interpolators: { linear: "nope" } };
        expect(() => interpolate(schema, "linear", 0, 1, 0.5)).toThrow(/unknown interpolator "nope"/);
    });
});
