import { describe, expect, it } from "vitest";
import { fromJson } from "./from-json.js";
import { fromJsonString } from "./from-json-string.js";

const airJson = {
    baseColor: [1, 1, 1, 0],
    metallic: 0,
    roughness: 0,
    irReflectance: 0,
    irEmission: 0,
    emissionRgb: [0, 0, 0],
    emissionMode: 0,
    density: 1.225,
    viscosity: 0,
    specificHeatCapacity: 1006,
    thermalConductivity: 0.024,
    stressStrainCurve: {
        tensileYieldStrainStress: [0, 0],
        tensileFractureStrainStress: [0, 0],
        compressiveYieldStrainStress: [0, 0],
        compressiveFractureStrainStress: [0, 0],
    },
    restitution: 0,
} as const;

describe("fromJson", () => {
    it("parses a name → props library object", () => {
        const result = fromJson({ air: airJson, rock: airJson });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(Object.keys(result.definitions)).toEqual(["air", "rock"]);
        expect(result.definitions.air?.density).toBe(1.225);
        expect(result.definitions.air?.heatCapacity).toBe(1006);
        expect(result.definitions.air?.metallicFactor).toBe(0);
    });

    it("rejects invalid entries", () => {
        const result = fromJson({ bad: { metallic: 1 } });
        expect(result).toEqual({ ok: false, reason: "invalid_entry", name: "bad" });
    });
});

describe("fromJsonString", () => {
    it("parses JSON text", () => {
        const result = fromJsonString(JSON.stringify({ air: airJson }));
        expect(result.ok).toBe(true);
    });
});
