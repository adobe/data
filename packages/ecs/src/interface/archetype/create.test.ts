import { describe, expect, it } from "vitest";
import { Component } from "../component/component.js";
import { archetypeIndexOf } from "../registry/index.js";
import { Archetype } from "./archetype.js";

const position = Symbol("archetypeCreateTest/position");
const velocity = Symbol("archetypeCreateTest/velocity");
declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: number };
        [velocity]: { type: number };
    }
}
Component.register(position, { type: { type: "number" } });
Component.register(velocity, { type: { type: "number" } });

describe("Archetype.create", () => {
    it("returns its argument, with a program-wide index of its own", () => {
        const list = [position, velocity] as const;
        const particle = Archetype.create(list);
        const other = Archetype.create([velocity]);
        expect(particle).toBe(list);
        expect(particle).toEqual([position, velocity]);
        expect(archetypeIndexOf(particle)).toBeGreaterThanOrEqual(0);
        expect(archetypeIndexOf(other)).toBeGreaterThan(archetypeIndexOf(particle));
        expect(Object.keys(particle)).toEqual(["0", "1"]);
    });
    it("keeps the index of a list given again", () => {
        const particle = Archetype.create([position]);
        const index = archetypeIndexOf(particle);
        expect(Archetype.create(particle)).toBe(particle);
        expect(archetypeIndexOf(particle)).toBe(index);
    });
    it("gives a plain list no index", () => {
        expect(archetypeIndexOf([position])).toBe(-1);
    });
    it("throws for a component listed twice", () => {
        expect(() => Archetype.create([position, velocity, position])).toThrow(`An archetype lists "archetypeCreateTest/position" twice.`);
    });
});
