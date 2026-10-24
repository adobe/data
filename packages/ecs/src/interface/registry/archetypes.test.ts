// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { archetypeIndexKey, indexArchetype } from "./archetypes.js";

/** The index a list was given, or -1 without one. */
const archetypeIndexOf = (list: readonly unknown[]): number => {
    const index: unknown = Reflect.get(list, archetypeIndexKey);
    return typeof index === "number" ? index : -1;
};

const position = Symbol();
const velocity = Symbol();
const gravity = Symbol();
declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: number };
        [velocity]: { type: number };
    }
    interface Resources {
        [gravity]: { type: number };
    }
}

/** Lists the build gives indexes: top-level lists of components declared as const. */
const Particle = [position, velocity] as const;
const Moving = [velocity] as const;
/** A list naming a resource isn't a list of components, so it has no index. */
const WithResource = [position, gravity] as const;

describe("archetype indexes", () => {
    it("are given by the build to each top-level list of components declared as const", () => {
        expect(archetypeIndexOf(Particle)).toBeGreaterThanOrEqual(0);
        expect(archetypeIndexOf(Moving)).toBeGreaterThanOrEqual(0);
        expect(archetypeIndexOf(Moving)).not.toBe(archetypeIndexOf(Particle));
        expect(Object.keys(Particle)).toEqual(["0", "1"]);
    });
    it("aren't given to a list made at runtime, or one naming anything but components", () => {
        expect(archetypeIndexOf([position, velocity])).toBe(-1);
        expect(archetypeIndexOf(WithResource)).toBe(-1);
    });
    it("are given to the package's own lists once, and never twice", () => {
        const list = [position];
        indexArchetype(list);
        const index = archetypeIndexOf(list);
        indexArchetype(list);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(archetypeIndexOf(list)).toBe(index);
        expect(() => indexArchetype([position, velocity, position])).toThrow("twice");
    });
});
