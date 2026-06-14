import { describe, expect, it } from "vitest";
import { Database } from "@adobe/data/ecs";
import { plugin } from "./material-plugin.js";
import { assembleMaterialRow } from "./assemble-material-row.js";
import { requireMaterial } from "./require-material.js";
import { solidDefaults } from "./material-defaults.js";
import { StressStrainCurve } from "./stress-strain-curve/stress-strain-curve.js";

const noSolidCurve = StressStrainCurve.create({
    tensileYieldStrainStress: [0, 0],
    tensileFractureStrainStress: [0, 0],
    compressiveYieldStrainStress: [0, 0],
    compressiveFractureStrainStress: [0, 0],
});

const rockRow = {
    name: "rock",
    ...solidDefaults,
    baseColorFactor: [0.5, 0.5, 0.5, 1] as const,
    emissiveFactor: [0, 0, 0] as const,
    metallicFactor: 0,
    roughnessFactor: 0.8,
    irReflectance: 0.1,
    irEmission: 0,
    emissionMode: 0,
    restitution: 0.15,
    density: 2650,
    viscosity: 0,
    heatCapacity: 800,
    thermalConductivity: 4,
    stressStrainCurve: noSolidCurve,
};

describe("materialByName index", () => {
    it("returns the material entity for a known name", () => {
        const db = Database.create(plugin);
        const rock = db.transactions.insertMaterial(rockRow);
        expect(db.indexes.materialByName.get({ name: "rock" })).toBe(rock);
    });

    it("returns null for an unknown name", () => {
        const db = Database.create(plugin);
        expect(db.indexes.materialByName.get({ name: "missing" })).toBeNull();
    });

    it("is populated by seedStandardMaterials", () => {
        const db = Database.create(plugin);
        db.transactions.seedStandardMaterials();
        expect(db.indexes.materialByName.get({ name: "steel" })).not.toBeNull();
        expect(db.indexes.materialByName.get({ name: "ice" })).not.toBeNull();
    });

    it("rejects duplicate material names", () => {
        const db = Database.create(plugin);
        db.transactions.insertMaterial(rockRow);
        expect(() => db.transactions.insertMaterial(rockRow)).toThrow(/Unique index conflict/);
    });

    it("insertMaterial validates required fields", () => {
        const db = Database.create(plugin);
        expect(() => db.transactions.insertMaterial({ ...rockRow, density: undefined as unknown as number })).toThrow(/missing required fields.*density/);
    });
});

describe("requireMaterial", () => {
    it("returns the material entity for a known name", () => {
        const db = Database.create(plugin);
        const rock = db.transactions.insertMaterial(rockRow);
        expect(requireMaterial(db, "rock")).toBe(rock);
    });

    it("throws when the material was never seeded", () => {
        const db = Database.create(plugin);
        expect(() => requireMaterial(db, "missing")).toThrow(/Material "missing" is not in the registry/);
    });
});

describe("assembleMaterialRow", () => {
    it("throws when a required field is missing from the definition", () => {
        expect(() => assembleMaterialRow("bad", { baseColorFactor: [1, 1, 1, 1] })).toThrow(/missing required fields.*density/);
    });

    it("merges solidDefaults and returns a full row", () => {
        const row = assembleMaterialRow("rock", {
            baseColorFactor: [0.5, 0.5, 0.5, 1],
            emissiveFactor: [0, 0, 0],
            metallicFactor: 0,
            roughnessFactor: 0.8,
            density: 2650,
            restitution: 0.15,
            heatCapacity: 800,
        });
        expect(row.name).toBe("rock");
        expect(row.density).toBe(2650);
        expect(row.friction).toBe(solidDefaults.friction);
    });
});
