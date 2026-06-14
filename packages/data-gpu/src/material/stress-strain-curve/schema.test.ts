import { describe, expect, it } from "vitest";
import { getStructLayout } from "@adobe/data/typed-buffer";
import { StressStrainCurve } from "./stress-strain-curve.js";

describe("StressStrainCurve.schema — struct layout", () => {
    it("is a valid struct layout", () => {
        expect(() => getStructLayout(StressStrainCurve.schema)).not.toThrow();
    });

    it("uses packed layout with four vec2 fields", () => {
        const layout = getStructLayout(StressStrainCurve.schema);

        expect(layout.layout).toBe("packed");
        expect(layout.size).toBe(32);
        expect(layout.fields.tensileYieldStrainStress.offset).toBe(0);
        expect(layout.fields.tensileFractureStrainStress.offset).toBe(8);
        expect(layout.fields.compressiveYieldStrainStress.offset).toBe(16);
        expect(layout.fields.compressiveFractureStrainStress.offset).toBe(24);
    });
});
